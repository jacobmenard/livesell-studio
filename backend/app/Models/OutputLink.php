<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * A private, revocable clean-screen link. Only a hash of the token is stored.
 *
 * @property int $id
 * @property int $setup_id
 * @property string $public_id
 * @property string $token_hash
 * @property Carbon|null $revoked_at
 * @property Carbon|null $last_seen_at
 */
class OutputLink extends Model
{
    public const TOKEN_LENGTH = 48;

    protected $fillable = [
        'public_id',
        'token_hash',
        'last_seen_at',
        'revoked_at',
    ];

    protected $hidden = [
        'token_hash',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Setup, $this> */
    public function setup(): BelongsTo
    {
        return $this->belongsTo(Setup::class);
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function generateToken(): string
    {
        return Str::random(self::TOKEN_LENGTH);
    }

    /** Finds the active link for a raw token, or null. */
    public static function findActiveByToken(string $token): ?self
    {
        if (strlen($token) !== self::TOKEN_LENGTH || ! ctype_alnum($token)) {
            return null;
        }

        return self::query()
            ->with('setup')
            ->where('token_hash', self::hashToken($token))
            ->whereNull('revoked_at')
            ->first();
    }

    /** @param Builder<OutputLink> $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('revoked_at');
    }

    public function channelName(): string
    {
        return 'output.'.$this->public_id;
    }
}
