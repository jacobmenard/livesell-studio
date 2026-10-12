<?php

namespace App\Services;

use App\Models\LiveSession;
use App\Models\Plan;
use App\Models\Setup;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Open clean screens, kept alive by heartbeats. A plan limits how many different setups an
 * account has live at once; the same setup open twice (window and OBS link, say) counts once.
 * A screen that stops sending heartbeats (closed tab, crashed browser) frees its slot.
 */
final class LiveSessions
{
    /** How often clean screens report in. */
    public const HEARTBEAT_SECONDS = 30;

    /** Silent this long = closed. */
    public const STALE_SECONDS = 90;

    public function start(Setup $setup, ?User $startedBy, string $source): LiveSession
    {
        return DB::transaction(function () use ($setup, $startedBy, $source): LiveSession {
            $account = $this->lockAccount($setup);
            $this->ensureRoomFor($account, $setup, $source);

            $session = new LiveSession;
            $session->account_id = $account->id;
            $session->setup_id = $setup->id;
            $session->started_by = $startedBy?->id;
            $session->source = $source;
            $session->last_seen_at = now();
            $session->save();

            return $session;
        });
    }

    /** Keeps a session alive. One that went quiet must still fit the plan to come back. */
    public function beat(LiveSession $session): LiveSession
    {
        return DB::transaction(function () use ($session): LiveSession {
            $setup = $session->setup()->firstOrFail();
            $account = $this->lockAccount($setup);
            if ($session->last_seen_at->lt($this->cutoff())) {
                $this->ensureRoomFor($account, $setup, $session->source, except: $session->id);
            }
            $session->last_seen_at = now();
            $session->save();

            return $session;
        });
    }

    public function end(LiveSession $session): void
    {
        $session->delete();
    }

    public function isLive(Setup $setup): bool
    {
        return LiveSession::query()->where('setup_id', $setup->id)->where('last_seen_at', '>=', $this->cutoff())->exists();
    }

    public function liveSetupCount(User $account): int
    {
        return LiveSession::query()
            ->where('account_id', $account->id)
            ->where('last_seen_at', '>=', $this->cutoff())
            ->distinct()
            ->count('setup_id');
    }

    /** The plan allows this setup to be live: it already is, or there is a free slot. */
    private function ensureRoomFor(User $account, Setup $setup, string $source, ?string $except = null): void
    {
        $live = LiveSession::query()
            ->where('account_id', $account->id)
            ->where('last_seen_at', '>=', $this->cutoff())
            ->when($except, fn ($q) => $q->whereKeyNot($except))
            ->distinct()
            ->pluck('setup_id');

        if ($live->contains($setup->id)) {
            return;
        }

        $plan = Plan::forAccount($account);
        if ($plan->max_live_setups === 0) {
            // The seller's own window may show a watermarked preview; OBS links and streaming can't.
            throw $source === 'screen'
                ? new LiveLimitReached("Preview only: you're on the {$plan->name} plan, so going live needs a paid plan. Choose one on the Plan page.", preview: true)
                : new LiveLimitReached("You're on the {$plan->name} plan: you can set everything up, but going live needs a plan. Choose a plan on the Plan page to go live.");
        }
        if ($live->count() >= $plan->max_live_setups) {
            $setups = $plan->max_live_setups === 1 ? '1 setup' : "{$plan->max_live_setups} setups";
            throw new LiveLimitReached("Your {$plan->name} plan can have {$setups} live at once. Close another live, or upgrade your plan to go live on more.");
        }
    }

    /**
     * Serializes go-live checks per account, so two screens opened at the same moment can't
     * both take the last slot.
     */
    private function lockAccount(Setup $setup): User
    {
        return User::query()->whereKey($setup->user_id)->lockForUpdate()->firstOrFail();
    }

    private function cutoff(): Carbon
    {
        return now()->subSeconds(self::STALE_SECONDS);
    }
}
