<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property string $platform
 * @property string $server_url
 * @property string $stream_key
 */
class StreamDestination extends Model
{
    protected $fillable = [
        'platform',
        'server_url',
        'stream_key',
    ];

    /** The key is a secret: never serialize it. */
    protected $hidden = [
        'stream_key',
    ];

    protected function casts(): array
    {
        return [
            'stream_key' => 'encrypted',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Last four characters only, e.g. "••••a1b2". */
    public function keyHint(): string
    {
        $key = (string) $this->stream_key;

        return '••••'.(mb_strlen($key) > 8 ? mb_substr($key, -4) : '');
    }
}
