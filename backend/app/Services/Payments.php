<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\PaymentReviewed;
use App\Notifications\PaymentSubmitted;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Plans paid by hand: the seller pays the plan's price (GCash) and submits the reference
 * number with a receipt screenshot; the superadmin checks it and approves (the plan runs for
 * a month from that day, ending any free trial) or rejects it. The app keeps no bank details.
 *
 * Renewing the same plan adds a month after the current one, but only one month ahead.
 * Switching to another plan starts fresh on the approval date (days left are not carried).
 */
final class Payments
{
    public function __construct(
        private readonly Subscriptions $subscriptions,
        private readonly MediaStorage $media,
    ) {}

    /**
     * Until when the account must wait before paying for $plan again, or null when it can pay
     * now. Only a renewal of the plan it already has can be early: one month ahead at most.
     */
    public function renewableFrom(User $account, Plan $plan): ?Carbon
    {
        $subscription = $this->currentSubscription($account);
        if (! $subscription || $subscription->plan_id !== $plan->id || $subscription->ends_at === null) {
            return null;
        }
        $from = $subscription->ends_at->copy()->subMonthNoOverflow();

        return $from->isFuture() ? $from : null;
    }

    public function pendingFor(User $account): ?Payment
    {
        return Payment::query()->where('user_id', $account->id)->pending()->with('plan')->latest('id')->first();
    }

    public function submit(User $account, User $submitter, Plan $plan, string $reference, UploadedFile $proof): Payment
    {
        $reference = self::normalizeReference($reference);
        $this->guardSubmission($account, $plan, $reference);

        $mime = (string) $proof->getMimeType();
        [$bytes] = $this->media->sanitizeImage($proof->getRealPath(), $mime, 'proof');
        $extension = match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
        $path = sprintf('payment-proofs/%d/%s.%s', $account->id, Str::lower((string) Str::ulid()), $extension);
        Storage::disk(Payment::PROOF_DISK)->put($path, $bytes);

        try {
            $payment = DB::transaction(function () use ($account, $submitter, $plan, $reference, $path): Payment {
                // One submission per account at a time: check again under a lock on the owner.
                User::query()->whereKey($account->id)->lockForUpdate()->first();
                $this->guardSubmission($account, $plan, $reference);

                $payment = new Payment;
                $payment->forceFill([
                    'user_id' => $account->id,
                    'submitted_by' => $submitter->id,
                    'plan_id' => $plan->id,
                    // Always the plan's price, never an amount from the seller.
                    'amount' => $plan->price_monthly,
                    'currency' => $plan->currency,
                    'method' => Payment::METHOD_GCASH_BANK,
                    'reference_number' => $reference,
                    'proof_path' => $path,
                ])->save();

                return $payment;
            });
        } catch (\Throwable $e) {
            Storage::disk(Payment::PROOF_DISK)->delete($path); // don't leave an orphaned receipt
            throw $e;
        }

        $payment->setRelation('plan', $plan)->setRelation('account', $account);
        $this->notify(User::query()->where('role', 'superadmin')->get(), new PaymentSubmitted($payment));

        return $payment;
    }

    /** Puts the plan in force: from today, or (renewing the same plan) after the current month. */
    public function approve(Payment $payment, User $admin): Payment
    {
        $payment = DB::transaction(function () use ($payment, $admin): Payment {
            $payment = Payment::query()->with(['plan', 'account'])->lockForUpdate()->findOrFail($payment->id);
            if (! $payment->isPending()) {
                throw ValidationException::withMessages(['payment' => 'This payment was already reviewed.']);
            }

            $subscription = $this->currentSubscription($payment->account);
            $renewing = $subscription && $subscription->plan_id === $payment->plan_id;
            if ($renewing && $subscription->ends_at === null) {
                throw ValidationException::withMessages(['payment' => 'This account’s plan has no end date already. Reject the payment instead.']);
            }
            $start = $renewing ? $subscription->ends_at->copy() : now();
            $end = $start->copy()->addMonthNoOverflow();

            $this->subscriptions->apply($payment->account, $payment->plan, $end);

            $payment->forceFill([
                'status' => Payment::APPROVED,
                'review_note' => null,
                'reviewed_by' => $admin->id,
                'reviewed_at' => now(),
                'period_start' => $start,
                'period_end' => $end,
            ])->save();

            return $payment;
        });

        $this->notify($payment->account, new PaymentReviewed($payment));

        return $payment;
    }

    public function reject(Payment $payment, User $admin, string $reason): Payment
    {
        $payment = DB::transaction(function () use ($payment, $admin, $reason): Payment {
            $payment = Payment::query()->with(['plan', 'account'])->lockForUpdate()->findOrFail($payment->id);
            if (! $payment->isPending()) {
                throw ValidationException::withMessages(['payment' => 'This payment was already reviewed.']);
            }
            $payment->forceFill([
                'status' => Payment::REJECTED,
                'review_note' => trim($reason),
                'reviewed_by' => $admin->id,
                'reviewed_at' => now(),
            ])->save();

            return $payment;
        });

        $this->notify($payment->account, new PaymentReviewed($payment));

        return $payment;
    }

    /** Refuses a payment the account can't make right now, with a reason for the seller. */
    private function guardSubmission(User $account, Plan $plan, string $reference): void
    {
        if (! $plan->purchasable || $plan->price_monthly < 1) {
            throw ValidationException::withMessages(['plan' => 'That plan can’t be bought.']);
        }
        if ($this->pendingFor($account)) {
            throw ValidationException::withMessages(['plan' => 'Your last payment is still being checked. You can pay again once it’s reviewed.']);
        }
        $subscription = $this->currentSubscription($account);
        if ($subscription && $subscription->plan_id === $plan->id && $subscription->ends_at === null) {
            throw ValidationException::withMessages(['plan' => "Your {$plan->name} plan has no end date, so there’s nothing to renew."]);
        }
        if ($from = $this->renewableFrom($account, $plan)) {
            throw ValidationException::withMessages(['plan' => "You can renew {$plan->name} from {$from->format('M j, Y')} (one month ahead at most)."]);
        }
        if (! preg_match('/^[A-Z0-9]{6,30}$/', $reference)) {
            throw ValidationException::withMessages(['reference_number' => 'Enter the reference number from your GCash receipt (6–30 letters or numbers).']);
        }
        $used = Payment::query()
            ->where('reference_number', $reference)
            ->where('status', '!=', Payment::REJECTED)
            ->exists();
        if ($used) {
            throw ValidationException::withMessages(['reference_number' => 'That reference number was already submitted.']);
        }
    }

    /** "1234 567 890" → "1234567890"; letters are kept (bank references can have them). */
    public static function normalizeReference(string $reference): string
    {
        return Str::upper((string) preg_replace('/[\s-]+/', '', $reference));
    }

    private function currentSubscription(User $account): ?Subscription
    {
        $subscription = $account->subscription()->first();

        return $subscription && $subscription->isCurrent() ? $subscription : null;
    }

    /**
     * The payment is saved either way: a mail server hiccup must not lose it or fail the
     * request (the superadmin still sees it in the app).
     *
     * @param  mixed  $notifiables
     */
    private function notify($notifiables, object $notification): void
    {
        try {
            Notification::send($notifiables, $notification);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
