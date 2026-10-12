<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Database\Seeders\SuperAdminSeeder;
use Database\Seeders\TestSellerSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Tests\TestCase;

class SeederTest extends TestCase
{
    use RefreshDatabase;

    private function configureSuperAdmin(?string $password, string $email = 'Boss@Example.com'): void
    {
        config(['livesell.superadmin' => ['name' => 'Boss', 'email' => $email, 'password' => $password]]);
    }

    public function test_the_superadmin_is_created_from_config_and_can_log_in(): void
    {
        $this->configureSuperAdmin('super-secret-1');

        $this->seed(SuperAdminSeeder::class);

        $admin = User::query()->where('email', 'boss@example.com')->sole();
        $this->assertSame(UserRole::SuperAdmin, $admin->role);
        $this->assertTrue($admin->isSuperAdmin());
        $this->assertNotNull($admin->email_verified_at);

        $this->postJson('/api/auth/login', ['email' => 'boss@example.com', 'password' => 'super-secret-1'])->assertOk();
        $this->assertAuthenticatedAs($admin);
    }

    public function test_seeding_again_keeps_one_account_and_rotates_a_changed_password(): void
    {
        $this->configureSuperAdmin('first-password');
        $this->seed(SuperAdminSeeder::class);

        $this->configureSuperAdmin('second-password');
        $this->seed(SuperAdminSeeder::class);

        $admin = User::query()->where('email', 'boss@example.com')->sole();
        $this->assertTrue(Hash::check('second-password', $admin->password));
    }

    public function test_without_a_password_a_new_superadmin_gets_a_generated_one_locally(): void
    {
        $this->configureSuperAdmin(null);

        $this->seed(SuperAdminSeeder::class);

        $admin = User::query()->where('email', 'boss@example.com')->sole();
        $this->assertTrue($admin->isSuperAdmin());
        $this->assertFalse(Hash::check('', $admin->password));
    }

    public function test_an_existing_seller_is_promoted_without_touching_their_password(): void
    {
        User::factory()->create(['email' => 'boss@example.com', 'password' => 'their-own-password']);
        $this->configureSuperAdmin(null);

        $this->seed(SuperAdminSeeder::class);

        $admin = User::query()->where('email', 'boss@example.com')->sole();
        $this->assertTrue($admin->isSuperAdmin());
        $this->assertTrue(Hash::check('their-own-password', $admin->password));
    }

    public function test_production_refuses_to_create_a_superadmin_without_a_password(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        $this->configureSuperAdmin(null);

        $this->expectException(RuntimeException::class);

        (new SuperAdminSeeder)->run();
    }

    public function test_a_short_configured_password_is_rejected(): void
    {
        $this->configureSuperAdmin('short');

        $this->expectException(RuntimeException::class);

        (new SuperAdminSeeder)->run();
    }

    public function test_the_test_seller_is_a_seller_with_one_setup_and_is_not_duplicated(): void
    {
        $this->seed(TestSellerSeeder::class);
        $this->seed(TestSellerSeeder::class);

        $seller = User::query()->where('email', TestSellerSeeder::EMAIL)->sole();
        $this->assertSame(UserRole::Seller, $seller->role);
        $this->assertSame(1, $seller->setups()->count());

        $this->postJson('/api/auth/login', ['email' => TestSellerSeeder::EMAIL, 'password' => TestSellerSeeder::PASSWORD])->assertOk();
    }

    public function test_the_test_seller_is_never_seeded_in_production(): void
    {
        $this->app->detectEnvironment(fn () => 'production');

        // Called directly: `db:seed` itself stops to ask for confirmation in production.
        $this->app->call([new TestSellerSeeder, 'run']);

        $this->assertDatabaseMissing('users', ['email' => TestSellerSeeder::EMAIL]);
    }

    public function test_sign_up_cannot_grant_itself_the_superadmin_role(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Sneaky',
            'email' => 'sneaky@example.com',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
            'role' => 'superadmin',
        ])->assertCreated();

        $this->assertSame(UserRole::Seller, User::query()->where('email', 'sneaky@example.com')->sole()->role);
    }
}
