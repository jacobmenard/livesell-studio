<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class ImpersonationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $name = 'Super Admin'): User
    {
        $admin = User::factory()->create(['name' => $name]);
        $admin->forceFill(['role' => UserRole::SuperAdmin])->save();

        return $admin;
    }

    /** Like a new request in a real browser: who's signed in comes from the session again. */
    private function nextRequest(): static
    {
        $this->app['auth']->forgetGuards();

        return $this;
    }

    private function member(User $owner): User
    {
        $member = User::factory()->create();
        $member->forceFill(['owner_id' => $owner->id])->save();

        return $member;
    }

    public function test_the_superadmin_sees_the_seller_account_owners_only(): void
    {
        $admin = $this->admin();
        $owner = User::factory()->create(['name' => 'Gwapo Shop', 'email' => 'gwapo@example.com']);
        $this->member($owner);
        User::factory()->create(['name' => 'Other Store']);

        $this->actingAs($admin)->getJson('/api/admin/accounts')
            ->assertOk()
            ->assertJsonPath('meta.total', 2) // no sub-user, no superadmin
            ->assertJsonPath('data.1.email', 'gwapo@example.com')
            ->assertJsonPath('data.1.members', 1)
            ->assertJsonPath('data.1.plan.code', 'trial');

        $this->getJson('/api/admin/accounts?search=gwapo')->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.name', 'Gwapo Shop');
        // Wildcards are searched for literally.
        $this->getJson('/api/admin/accounts?search=%25')->assertJsonPath('meta.total', 0);
    }

    public function test_the_superadmin_signs_in_as_an_owner_and_comes_back(): void
    {
        Log::spy();
        $admin = $this->admin('Menard');
        $owner = User::factory()->create(['name' => 'Gwapo Shop']);

        $this->actingAs($admin)->postJson("/api/admin/accounts/{$owner->id}/impersonate")
            ->assertOk()
            ->assertJsonPath('data.id', $owner->id);

        // Now the app is the owner's, with a banner saying who's really there.
        $this->nextRequest()->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $owner->id)
            ->assertJsonPath('data.role', 'seller')
            ->assertJsonPath('data.impersonated_by', 'Menard');
        $this->nextRequest()->getJson('/api/setups')->assertOk();
        // The owner can't reach the admin screens, so neither can the impersonation.
        $this->nextRequest()->getJson('/api/admin/accounts')->assertForbidden();

        $this->nextRequest()->postJson('/api/auth/impersonation/stop')
            ->assertOk()
            ->assertJsonPath('data.id', $admin->id)
            ->assertJsonPath('data.impersonated_by', null);
        $this->nextRequest()->getJson('/api/auth/me')->assertJsonPath('data.id', $admin->id)->assertJsonPath('data.impersonated_by', null);
        $this->nextRequest()->getJson('/api/admin/accounts')->assertOk();

        Log::shouldHaveReceived('notice')->with('[impersonation] started', \Mockery::on(fn (array $c) => $c['admin_id'] === $admin->id && $c['account_id'] === $owner->id))->once();
        Log::shouldHaveReceived('notice')->with('[impersonation] stopped', \Mockery::on(fn (array $c) => $c['admin_id'] === $admin->id && $c['account_id'] === $owner->id))->once();
    }

    public function test_only_seller_account_owners_can_be_impersonated(): void
    {
        $admin = $this->admin();
        $owner = User::factory()->create();
        $member = $this->member($owner);
        $otherAdmin = $this->admin('Other Admin');

        $this->actingAs($admin);
        $this->postJson("/api/admin/accounts/{$member->id}/impersonate")->assertUnprocessable();
        $this->postJson("/api/admin/accounts/{$otherAdmin->id}/impersonate")->assertUnprocessable();
        $this->postJson("/api/admin/accounts/{$admin->id}/impersonate")->assertUnprocessable();
        $this->postJson('/api/admin/accounts/99999/impersonate')->assertNotFound();
        $this->getJson('/api/auth/me')->assertJsonPath('data.id', $admin->id);
    }

    public function test_sellers_cannot_list_or_impersonate_and_stopping_needs_an_impersonation(): void
    {
        $seller = User::factory()->create();
        $other = User::factory()->create();

        $this->actingAs($seller)->getJson('/api/admin/accounts')->assertForbidden();
        $this->postJson("/api/admin/accounts/{$other->id}/impersonate")->assertForbidden();
        $this->postJson('/api/auth/impersonation/stop')->assertUnprocessable();
        $this->getJson('/api/auth/me')->assertJsonPath('data.id', $seller->id)->assertJsonPath('data.impersonated_by', null);
    }

    public function test_logging_in_as_someone_else_ends_the_impersonation_for_good(): void
    {
        $admin = $this->admin();
        $owner = User::factory()->create();
        $other = User::factory()->create(['email' => 'other@example.com']);
        $this->actingAs($admin)->postJson("/api/admin/accounts/{$owner->id}/impersonate")->assertOk();

        $this->nextRequest()->postJson('/api/auth/login', ['email' => 'other@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJsonPath('data.id', $other->id)
            ->assertJsonPath('data.impersonated_by', null);

        // No way back into the admin account from here.
        $this->nextRequest()->postJson('/api/auth/impersonation/stop')->assertUnprocessable();
        $this->nextRequest()->getJson('/api/auth/me')->assertJsonPath('data.id', $other->id);
    }

    public function test_coming_back_signs_out_if_the_admin_lost_their_role_meanwhile(): void
    {
        $admin = $this->admin();
        $owner = User::factory()->create();
        $this->actingAs($admin)->postJson("/api/admin/accounts/{$owner->id}/impersonate")->assertOk();

        $admin->forceFill(['role' => UserRole::Seller])->save();

        $this->nextRequest()->postJson('/api/auth/impersonation/stop')->assertUnauthorized();
        $this->assertGuest('web');
    }
}
