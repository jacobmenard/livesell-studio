<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A subscription plan. Every plan has every styling and go-live feature; plans differ in
 * how many sub-users an account may add and how many setups it may have live at once.
 *
 * @property int $id
 * @property string $code
 * @property string $name
 * @property int $price_monthly whole units of $currency
 * @property string $currency
 * @property int $max_subusers
 * @property int $max_live_setups
 * @property int $sort_order
 * @property bool $purchasable false for the free trial (what unpaid accounts have)
 */
class Plan extends Model
{
    protected $fillable = [
        'name',
        'price_monthly',
        'max_subusers',
        'max_live_setups',
    ];

    protected function casts(): array
    {
        return [
            'price_monthly' => 'integer',
            'max_subusers' => 'integer',
            'max_live_setups' => 'integer',
            'sort_order' => 'integer',
            'purchasable' => 'boolean',
        ];
    }

    /** @param Builder<Plan> $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort_order')->orderBy('id');
    }

    /** The plan accounts have when they have no subscription (or it ran out). */
    public static function default(): self
    {
        return self::query()->where('code', config('livesell.default_plan'))->first()
            ?? self::query()->ordered()->firstOrFail();
    }

    /** The limits a new sign-up has during the free trial. */
    public static function trial(): self
    {
        return self::query()->where('code', config('livesell.trial_plan'))->first() ?? self::default();
    }

    /**
     * The plan an account has right now: its subscription's while current, else the trial's
     * during the free week, else the default.
     */
    public static function forAccount(User $account): self
    {
        $subscription = $account->subscription()->with('plan')->first();
        if ($subscription && $subscription->isCurrent()) {
            return $subscription->plan;
        }

        return $account->onTrial() ? self::trial() : self::default();
    }
}
