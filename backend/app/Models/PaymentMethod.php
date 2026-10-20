<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A way to pay for a plan, set up by the superadmin: a GCash, Maya or bank account. Sellers
 * pick one of the enabled ones, send the plan's price to it, then submit the receipt.
 *
 * @property int $id
 * @property string $type gcash | maya | bank
 * @property string|null $label the bank's name (required for a bank), optional otherwise
 * @property string $account_name
 * @property string $account_number
 * @property string|null $instructions
 * @property bool $enabled
 * @property int $sort_order
 */
class PaymentMethod extends Model
{
    public const TYPES = ['gcash', 'maya', 'bank'];

    private const TYPE_NAMES = ['gcash' => 'GCash', 'maya' => 'Maya', 'bank' => 'Bank'];

    protected $fillable = [
        'type',
        'label',
        'account_name',
        'account_number',
        'instructions',
        'enabled',
        'sort_order',
    ];

    // Read before a reload on new models too (models are strict outside production).
    protected $attributes = [
        'label' => null,
        'instructions' => null,
        'enabled' => true,
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @param Builder<PaymentMethod> $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort_order')->orderBy('id');
    }

    /** @param Builder<PaymentMethod> $query */
    public function scopeEnabled(Builder $query): void
    {
        $query->where('enabled', true);
    }

    /** "GCash", "Maya", or the bank's name. */
    public function displayName(): string
    {
        $label = trim((string) $this->label);

        return $label !== '' ? $label : self::TYPE_NAMES[$this->type] ?? ucfirst($this->type);
    }

    /** Kept on each payment, so it still says where the money went if this is edited later. */
    public function summary(): string
    {
        return mb_substr("{$this->displayName()} · {$this->account_number} · {$this->account_name}", 0, 160);
    }
}
