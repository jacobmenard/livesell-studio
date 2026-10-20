<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\PlanEndingSoon;
use App\Notifications\TrialEndingSoon;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * "Ending soon" emails to account owners: a few days before a paid plan ends (renew), and
 * before the free trial ends (choose a plan). Each goes out once; none while a payment is
 * waiting to be checked. Safe to run every hour.
 */
class SendPlanReminders extends Command
{
    protected $signature = 'plans:send-reminders';

    protected $description = 'Email account owners whose paid plan or free trial ends soon';

    public function handle(): int
    {
        $plans = $this->remindPlans();
        $trials = $this->remindTrials();
        $this->info("Sent {$plans} plan and {$trials} trial reminders.");

        return self::SUCCESS;
    }

    private function remindPlans(): int
    {
        $sent = 0;
        Subscription::query()
            ->with(['plan', 'user'])
            ->whereHas('plan', fn (Builder $plan) => $plan->where('purchasable', true))
            ->where('ends_at', '>', now())
            ->where('ends_at', '<=', now()->addDays((int) config('livesell.plan_reminder_days')))
            // Not yet reminded about this end date (a renewal moves it, so it's reminded again).
            ->where(fn (Builder $q) => $q->whereNull('reminded_ends_at')->orWhereColumn('reminded_ends_at', '!=', 'ends_at'))
            ->lazyById()
            ->each(function (Subscription $subscription) use (&$sent): void {
                $owner = $subscription->user;
                if ($owner === null || $this->hasPendingPayment($owner)) {
                    return;
                }
                if ($this->send($owner, new PlanEndingSoon($subscription->plan, $subscription->ends_at))) {
                    $subscription->forceFill(['reminded_ends_at' => $subscription->ends_at])->save();
                    $sent++;
                }
            });

        return $sent;
    }

    private function remindTrials(): int
    {
        $sent = 0;
        User::query()
            ->whereNull('owner_id')
            ->whereNull('trial_reminded_at')
            ->where('trial_ends_at', '>', now())
            ->where('trial_ends_at', '<=', now()->addDays((int) config('livesell.trial_reminder_days')))
            ->lazyById()
            ->each(function (User $owner) use (&$sent): void {
                if ($this->hasPendingPayment($owner)) {
                    return;
                }
                if ($this->send($owner, new TrialEndingSoon($owner->trial_ends_at))) {
                    $owner->forceFill(['trial_reminded_at' => now()])->save();
                    $sent++;
                }
            });

        return $sent;
    }

    private function hasPendingPayment(User $owner): bool
    {
        return Payment::query()->where('user_id', $owner->id)->pending()->exists();
    }

    /** A mail server hiccup skips this owner for now; the next run tries again. */
    private function send(User $owner, object $notification): bool
    {
        try {
            $owner->notify($notification);

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }
}
