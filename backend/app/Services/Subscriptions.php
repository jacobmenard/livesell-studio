<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Plans for accounts: which plan applies, what is in use, and putting an account on a plan
 * (when the superadmin approves a payment, or sets a plan by hand).
 */
final class Subscriptions
{
    public function __construct(private readonly LiveSessions $liveSessions) {}

    public function planFor(User $account): Plan
    {
        return Plan::forAccount($account);
    }

    /** @return array{subusers: int, live_setups: int} */
    public function usage(User $account): array
    {
        return [
            'subusers' => $account->subUsers()->whereNull('deactivated_at')->count(),
            'live_setups' => $this->liveSessions->liveSetupCount($account),
        ];
    }

    /** Puts an account on a plan until $endsAt (null = no end) and fits the team to it. */
    public function apply(User $account, Plan $plan, ?Carbon $endsAt): Subscription
    {
        return DB::transaction(function () use ($account, $plan, $endsAt): Subscription {
            $subscription = $this->subscriptionFor($account, $plan);
            $subscription->plan_id = $plan->id;
            $subscription->ends_at = $endsAt;
            $subscription->save();

            $this->fitSeats($account, $plan);

            return $subscription;
        });
    }

    /**
     * Pauses sub-users beyond the plan's seats (newest first) and brings paused ones back
     * when there is room again (oldest first). Nobody is deleted.
     */
    public function fitSeats(User $account, Plan $plan): void
    {
        $members = $account->subUsers()->orderBy('created_at')->orderBy('id')->get();
        $seats = $plan->max_subusers;

        foreach ($members as $i => $member) {
            $shouldBeActive = $i < $seats;
            if ($shouldBeActive && $member->isDeactivated()) {
                $member->forceFill(['deactivated_at' => null])->save();
            } elseif (! $shouldBeActive && ! $member->isDeactivated()) {
                $member->forceFill(['deactivated_at' => now()])->save();
            }
        }
    }

    private function subscriptionFor(User $account, Plan $plan): Subscription
    {
        return $account->subscription()->first() ?? (function () use ($account, $plan): Subscription {
            $subscription = new Subscription;
            $subscription->user()->associate($account);
            $subscription->plan_id = $plan->id;

            return $subscription;
        })();
    }
}
