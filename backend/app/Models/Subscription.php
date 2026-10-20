<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * An account owner's plan and until when it's paid (see App\Services\Payments).
 *
 * @property int $id
 * @property int $user_id
 * @property int $plan_id
 * @property Carbon|null $ends_at null = no end date (set by the superadmin)
 * @property Carbon|null $reminded_ends_at the end date an "ending soon" email was sent for
 */
class Subscription extends Model
{
    // Read before a reload on new models too (models are strict outside production).
    protected $attributes = [
        'ends_at' => null,
        'reminded_ends_at' => null,
    ];

    protected function casts(): array
    {
        return [
            'ends_at' => 'datetime',
            'reminded_ends_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Plan, $this> */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function isCurrent(): bool
    {
        return $this->ends_at === null || $this->ends_at->isFuture();
    }
}
