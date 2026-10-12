<?php

namespace App\Models;

use Database\Factories\SetupFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property int $id
 * @property int|null $user_id
 * @property bool $is_template
 * @property string $name
 * @property string|null $description
 * @property string $orientation
 * @property string $resolution
 * @property array<string, mixed> $camera
 * @property array<string, mixed> $background
 * @property array<string, mixed>|null $foreground
 * @property array<string, mixed> $sound_settings
 * @property array<string, mixed> $output_settings
 * @property array<string, mixed> $scene
 */
class Setup extends Model
{
    /** @use HasFactory<SetupFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'orientation',
        'resolution',
        'camera',
        'background',
        'foreground',
        'sound_settings',
        'output_settings',
        'scene',
        'scene_updated_at',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'is_template' => 'boolean',
            'camera' => 'array',
            'background' => 'array',
            'foreground' => 'array',
            'sound_settings' => 'array',
            'output_settings' => 'array',
            'scene' => 'array',
            'scene_updated_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<SetupPopup, $this> */
    public function popups(): HasMany
    {
        return $this->hasMany(SetupPopup::class)->orderBy('sort_order')->orderBy('id');
    }

    /** @return HasMany<OutputLink, $this> */
    public function outputLinks(): HasMany
    {
        return $this->hasMany(OutputLink::class);
    }

    /** @return HasOne<OutputLink, $this> */
    public function activeOutputLink(): HasOne
    {
        return $this->hasOne(OutputLink::class)->whereNull('revoked_at')->latestOfMany();
    }

    /**
     * Setups a user may open: their account's plus the shared starter templates.
     *
     * @param  Builder<Setup>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        $query->where(function (Builder $q) use ($user) {
            $q->where('user_id', $user->accountId())->orWhere('is_template', true);
        });
    }

    public function isOwnedBy(User $user): bool
    {
        return ! $this->is_template && (int) $this->user_id === $user->accountId();
    }
}
