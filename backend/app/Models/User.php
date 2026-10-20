<?php

namespace App\Models;

use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    // "role", "owner_id" and "deactivated_at" are deliberately not fillable, so sign-up can
    // never grant admin rights or attach itself to someone else's account.
    protected $fillable = [
        'name',
        'email',
        'password',
        'theme',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    /** The walkthroughs in the app (frontend src/tour/tours.ts). */
    public const TOURS = ['dashboard', 'editor'];

    // Set on new models too, so they can be read before a reload (models are strict).
    protected $attributes = [
        'theme' => 'system',
        'role' => 'seller',
        'owner_id' => null,
        'deactivated_at' => null,
        'trial_ends_at' => null,
        'trial_reminded_at' => null,
        'completed_tours' => null,
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'owner_id' => 'integer',
            'deactivated_at' => 'datetime',
            'trial_ends_at' => 'datetime',
            'trial_reminded_at' => 'datetime',
            'completed_tours' => 'array',
        ];
    }

    /** Marks a walkthrough as seen (finished or skipped), so it doesn't start again. */
    public function completeTour(string $tour): void
    {
        $done = $this->completed_tours ?? [];
        if (! in_array($tour, $done, true)) {
            $this->forceFill(['completed_tours' => [...$done, $tour]])->save();
        }
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === UserRole::SuperAdmin;
    }

    /** A team member working in someone else's account. */
    public function isSubUser(): bool
    {
        return $this->owner_id !== null;
    }

    /** Paused because the owner's plan has fewer seats than members. */
    public function isDeactivated(): bool
    {
        return $this->deactivated_at !== null;
    }

    /** In the free week after signing up (see Plan::forAccount); a plan put in place ends it. */
    public function onTrial(): bool
    {
        return $this->trial_ends_at !== null && $this->trial_ends_at->isFuture();
    }

    /**
     * The account this user works in: their own, or the owner's for a sub-user. Setups,
     * uploads, stream keys and the plan all belong to the account.
     */
    public function accountOwner(): self
    {
        if (! $this->isSubUser()) {
            return $this;
        }
        // Loaded once per request (and never lazily: models are strict outside production).
        if (! $this->relationLoaded('owner')) {
            $this->setRelation('owner', $this->owner()->firstOrFail());
        }

        return $this->getRelation('owner');
    }

    public function accountId(): int
    {
        return $this->owner_id ?? $this->id;
    }

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(self::class, 'owner_id');
    }

    /** @return HasMany<User, $this> */
    public function subUsers(): HasMany
    {
        return $this->hasMany(self::class, 'owner_id');
    }

    /** @return HasOne<Subscription, $this> */
    public function subscription(): HasOne
    {
        return $this->hasOne(Subscription::class);
    }

    /** @return HasMany<Setup, $this> */
    public function setups(): HasMany
    {
        return $this->hasMany(Setup::class);
    }

    /** @return HasMany<Media, $this> */
    public function media(): HasMany
    {
        return $this->hasMany(Media::class);
    }

    /** @return HasMany<StreamDestination, $this> */
    public function streamDestinations(): HasMany
    {
        return $this->hasMany(StreamDestination::class);
    }
}
