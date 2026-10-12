<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * @property int $id
 * @property int $user_id
 * @property string $kind
 * @property string $label
 * @property string $disk
 * @property string $path
 * @property string $mime
 * @property int $size
 * @property-read string $url
 */
class Media extends Model
{
    protected $table = 'media';

    protected $fillable = [
        'kind',
        'label',
        'disk',
        'path',
        'mime',
        'size',
        'width',
        'height',
    ];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @param Builder<Media> $query */
    public function scopeOwnedBy(Builder $query, int $userId, ?string $kind = null): void
    {
        $query->where('user_id', $userId)->when($kind, fn (Builder $q) => $q->where('kind', $kind));
    }

    protected function url(): Attribute
    {
        return Attribute::get(fn (): string => Storage::disk($this->disk)->url($this->path));
    }
}
