<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * An open clean screen, kept alive by heartbeats (see App\Services\LiveSessions).
 *
 * @property string $id
 * @property int $account_id
 * @property int $setup_id
 * @property int|null $started_by
 * @property string $source "screen" (the seller's window) or "link" (Browser Source link)
 * @property Carbon $last_seen_at
 */
class LiveSession extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Setup, $this> */
    public function setup(): BelongsTo
    {
        return $this->belongsTo(Setup::class);
    }
}
