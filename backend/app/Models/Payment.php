<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A seller's payment for a plan (sent from GCash to the business's bank account), waiting
 * for the superadmin to check the receipt. Approving it puts the plan in force for a month.
 *
 * @property int $id
 * @property int $user_id the account owner
 * @property int|null $submitted_by
 * @property int $plan_id
 * @property int $amount whole units of $currency, set from the plan's price (never from the seller)
 * @property string $currency
 * @property string $method
 * @property string $reference_number
 * @property string $proof_path on the private disk
 * @property string $status pending | approved | rejected
 * @property string|null $review_note the reason, when rejected
 * @property int|null $reviewed_by
 * @property Carbon|null $reviewed_at
 * @property Carbon|null $period_start
 * @property Carbon|null $period_end
 */
class Payment extends Model
{
    public const PENDING = 'pending';

    public const APPROVED = 'approved';

    public const REJECTED = 'rejected';

    /** Sent from GCash to a bank account (InstaPay). */
    public const METHOD_GCASH_BANK = 'gcash_bank';

    public const PROOF_DISK = 'local';

    protected $attributes = [
        'status' => self::PENDING,
        'review_note' => null,
        'reviewed_by' => null,
        'reviewed_at' => null,
        'period_start' => null,
        'period_end' => null,
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'reviewed_at' => 'datetime',
            'period_start' => 'datetime',
            'period_end' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function account(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    /** @return BelongsTo<User, $this> */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /** @return BelongsTo<Plan, $this> */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    /** @param Builder<Payment> $query */
    public function scopePending(Builder $query): void
    {
        $query->where('status', self::PENDING);
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }
}
