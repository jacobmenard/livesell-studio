<?php

namespace Database\Seeders;

use App\Models\User;
use App\Services\SetupWriter;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * A seller account with one blank setup, for local development and testing only.
 * Safe to run again: an existing account is left as it is.
 */
class TestSellerSeeder extends Seeder
{
    public const EMAIL = 'demo@livesell.test';

    public const PASSWORD = 'livesell-demo';

    public function run(SetupWriter $writer): void
    {
        if (app()->isProduction()) {
            $this->command?->warn('Skipped TestSellerSeeder: test accounts are never seeded in production.');

            return;
        }

        if (User::query()->where('email', self::EMAIL)->exists()) {
            return;
        }

        DB::transaction(function () use ($writer): void {
            $user = User::factory()->create([
                'name' => 'Demo Seller',
                'email' => self::EMAIL,
                'password' => self::PASSWORD,
            ]);

            $writer->createBlank($user, 'Saturday sale setup');
        });
    }
}
