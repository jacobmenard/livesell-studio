<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\PaymentReceived;
use App\Notifications\PaymentReviewed;
use App\Notifications\PaymentSubmitted;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Plans paid by hand: the seller picks one of the superadmin's payment methods (GCash, Maya
 * or a bank account), sends the plan's price to it and submits the reference number with a
 * receipt screenshot; the superadmin checks it and approves (the plan runs for a month from
 * that day, ending any free trial) or rejects it.
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

    /** @return Collection<int, PaymentMethod> the ways to pay sellers can choose from */
    public function methods(): Collection
    {
        return PaymentMethod::query()->enabled()->ordered()->get();
    }

    public function submit(User $account, User $submitter, Plan $plan, PaymentMethod $method, string $reference, UploadedFile $proof): Payment
    {
        $reference = self::normalizeReference($reference);
        $this->guardSubmission($account, $plan, $method, $reference);

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
            $payment = DB::transaction(function () use ($account, $submitter, $plan, $method, $reference, $path): Payment {
                // One submission per account at a time: check again under a lock on the owner.
                User::query()->whereKey($account->id)->lockForUpdate()->first();
                $this->guardSubmission($account, $plan, $method, $reference);

                $payment = new Payment;
                $payment->forceFill([
                    'user_id' => $account->id,
                    'submitted_by' => $submitter->id,
                    'plan_id' => $plan->id,
                    // Always the plan's price, never an amount from the seller.
                    'amount' => $plan->price_monthly,
                    'currency' => $plan->currency,
                    'method' => $method->type,
                    'payment_method_id' => $method->id,
                    'method_label' => $method->summary(),
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
        $this->notify($account, new PaymentReceived($payment));
        $this->notifyAdmins($payment);

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
    private function guardSubmission(User $account, Plan $plan, PaymentMethod $method, string $reference): void
    {
        if (! $method->enabled) {
            throw ValidationException::withMessages(['payment_method' => 'That payment method isn’t available. Choose another.']);
        }
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
            throw ValidationException::withMessages(['reference_number' => 'Enter the reference number from your receipt (6–30 letters or numbers).']);
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
    private function notifyAdmins(Payment $payment): void
    {
        $admins = User::query()->where('role', 'superadmin')->get();
        $this->notify($admins, new PaymentSubmitted($payment));

        // The business inbox (e.g. support@) and any extra addresses too, each once, skipping
        // invalid ones and those a superadmin account already uses.
        $taken = $admins->map(fn (User $admin): string => Str::lower($admin->email))->all();
        collect([config('livesell.payments_email'), ...config('livesell.payment_alert_emails', [])])
            ->map(fn ($email): string => trim((string) $email))
            ->filter(fn (string $email): bool => filter_var($email, FILTER_VALIDATE_EMAIL) !== false)
            ->unique(fn (string $email): string => Str::lower($email))
            ->reject(fn (string $email): bool => in_array(Str::lower($email), $taken, true))
            ->each(fn (string $email) => $this->notify(Notification::route('mail', $email), new PaymentSubmitted($payment)));
    }

    private function notify($notifiables, object $notification): void
    {
        try {
            Notification::send($notifiables, $notification);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
