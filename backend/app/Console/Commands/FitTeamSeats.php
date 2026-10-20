<?php

namespace App\Console\Commands;

use App\Models\Plan;
use App\Models\User;
use App\Services\Subscriptions;
use Illuminate\Console\Command;

/**
 * Plans and free trials end on their own (every request checks the end date), but sub-users
 * are only paused when a plan changes. This catches plans that simply ran out: members beyond
 * the account's seats now are paused, and paused ones come back when there's room again.
 */
class FitTeamSeats extends Command
{
    protected $signature = 'plans:fit-seats';

    protected $description = 'Fit every team to the seats of its current plan (after a plan or trial ends)';

    public function handle(Subscriptions $subscriptions): int
    {
        $teams = 0;
        User::query()
            ->whereNull('owner_id')
            ->whereHas('subUsers')
            ->lazyById()
            ->each(function (User $account) use ($subscriptions, &$teams): void {
                $subscriptions->fitSeats($account, Plan::forAccount($account));
                $teams++;
            });

        $this->info("Checked {$teams} ".($teams === 1 ? 'team' : 'teams').'.');

        return self::SUCCESS;
    }
}
