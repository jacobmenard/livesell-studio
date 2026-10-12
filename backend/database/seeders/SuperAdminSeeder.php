<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Creates (or promotes) the superadmin account from config('livesell.superadmin').
 * Safe to run again: a configured password is re-applied, so changing
 * SUPERADMIN_PASSWORD and re-seeding rotates it; otherwise the password is left alone.
 */
class SuperAdminSeeder extends Seeder
{
    private const MIN_PASSWORD_LENGTH = 8;

    public function run(): void
    {
        $config = config('livesell.superadmin');
        $email = Str::lower(trim((string) $config['email']));
        $password = (string) $config['password'];

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('SUPERADMIN_EMAIL must be a valid email address.');
        }

        if ($password !== '' && strlen($password) < self::MIN_PASSWORD_LENGTH) {
            throw new RuntimeException('SUPERADMIN_PASSWORD must be at least '.self::MIN_PASSWORD_LENGTH.' characters.');
        }

        $user = User::query()->firstOrNew(['email' => $email]);
        $generated = null;

        if ($password !== '') {
            $user->password = $password;
        } elseif (! $user->exists) {
            if (app()->isProduction()) {
                throw new RuntimeException('Set SUPERADMIN_PASSWORD before seeding the superadmin in production.');
            }
            $user->password = $generated = Str::password(24);
        }

        if (! $user->exists) {
            $user->name = $config['name'];
        }

        $user->forceFill([
            'role' => UserRole::SuperAdmin,
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();

        if ($generated !== null) {
            $this->command?->warn("Superadmin {$email} created with password: {$generated}");
            $this->command?->warn('This is shown once. Set SUPERADMIN_PASSWORD to choose your own.');
        }
    }
}
