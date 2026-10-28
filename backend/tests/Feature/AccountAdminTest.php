<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Models\Plan;
use App\Models\User;
use App\Services\SetupWriter;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/** Superadmin's Users page: one account's details, and deactivating / reactivating it. */
class AccountAdminTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::factory()->create(['name' => 'Menard']);
        $admin->forceFill(['role' => UserRole::SuperAdmin])->save();

        return $admin;
    }

    private function member(User $owner, array $attributes = []): User
    {
        $member = User::factory()->create($attributes);
        $member->forceFill(['owner_id' => $owner->id])->save();

        return $member;
    }

    /** Like a new request: who's signed in is looked up again (session or token). */
    private function nextRequest(): static
    {
        $this->app['auth']->forgetGuards();

        return $this;
    }

    /** Another browser, signed in as $user (a fresh session, so no one else's is reused). */
    private function browserOf(User $user): static
    {
        $this->nextRequest()->withoutToken()->flushSession();

        return $this->actingAs($user, 'web');
    }

    public function test_the_superadmin_views_an_account(): void
    {
        $owner = User::factory()->create(['name' => 'Gwapo Shop']);
        $this->member($owner, ['name' => 'Helper']);
        app(SetupWriter::class)->createBlank($owner);
        $owner->streamDestinations()->forceCreate(['platform' => 'facebook', 'server_url' => 'rtmps://live-api-s.facebook.com:443/rtmp/', 'stream_key' => 'FB-1']);

        $this->actingAs($this->admin())->getJson("/api/admin/accounts/{$owner->id}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Gwapo Shop')
            ->assertJsonPath('data.disabled_at', null)
            ->assertJsonPath('data.members', 1)
            ->assertJsonPath('data.team.0.name', 'Helper')
            ->assertJsonPath('data.team.0.active', true)
            ->assertJsonPath('data.setups', 1)
            ->assertJsonPath('data.platforms', ['facebook'])
            ->assertJsonPath('data.payments', [])
            // Stream keys never leave the server.
            ->assertDontSee('FB-1');
    }

    public function test_only_seller_account_owners_are_managed_and_only_by_the_superadmin(): void
    {
        $admin = $this->admin();
        $owner = User::factory()->create();
        $member = $this->member($owner);

        $this->actingAs($admin)->getJson("/api/admin/accounts/{$member->id}")->assertNotFound();
        $this->postJson("/api/admin/accounts/{$member->id}/deactivate")->assertNotFound();
        $this->postJson("/api/admin/accounts/{$admin->id}/deactivate")->assertNotFound();

        $this->actingAs($owner)->getJson("/api/admin/accounts/{$owner->id}")->assertForbidden();
        $this->postJson("/api/admin/accounts/{$owner->id}/deactivate")->assertForbidden();
        $this->assertNull($owner->fresh()->disabled_at);
    }

    public function test_a_deactivated_account_is_locked_out_until_reactivated(): void
    {
        Log::spy();
        $admin = $this->admin();
        $owner = User::factory()->create(['email' => 'owner@example.com', 'password' => 'owner-pass-1']);
        $this->member($owner, ['email' => 'helper@example.com', 'password' => 'helper-pass-1']);
        $setup = app(SetupWriter::class)->createBlank($owner);
        $link = $this->actingAs($owner)->postJson("/api/setups/{$setup->id}/output-link")->assertCreated()->json('data.token');
        $phone = $this->postJson('/api/mobile/login', ['email' => 'helper@example.com', 'password' => 'helper-pass-1', 'device_name' => 'Pixel 8'])->json('data.token');

        $this->browserOf($admin)->postJson("/api/admin/accounts/{$owner->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('data.id', $owner->id)
            ->assertJsonPath('data.disabled_at', fn ($at) => $at !== null);
        Log::shouldHaveReceived('notice')->with('[admin] account deactivated', \Mockery::on(fn ($c) => $c['account_id'] === $owner->id && $c['admin_id'] === $admin->id));

        // The team's phones are signed out at once.
        $this->nextRequest()->withToken($phone)->getJson('/api/auth/me')->assertUnauthorized();
        // An open browser session is ended on its next request.
        $this->browserOf($owner->fresh())->getJson('/api/setups')->assertForbidden()->assertJsonPath('message', EnsureAccountIsActive::DISABLED_MESSAGE);
        // Nobody in the account can sign in again: website or app, owner or sub-user.
        $this->nextRequest()->withoutToken()->postJson('/api/auth/login', ['email' => 'owner@example.com', 'password' => 'owner-pass-1'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', EnsureAccountIsActive::DISABLED_MESSAGE);
        $this->nextRequest()->postJson('/api/mobile/login', ['email' => 'helper@example.com', 'password' => 'helper-pass-1', 'device_name' => 'Pixel 8'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', EnsureAccountIsActive::DISABLED_MESSAGE);
        // Its clean screens go dark, and it can't be opened with "Log in as".
        $this->getJson("/api/output/{$link}")->assertNotFound();
        $this->browserOf($admin)->postJson("/api/admin/accounts/{$owner->id}/impersonate")->assertUnprocessable()->assertJsonValidationErrors('account');
        $this->getJson('/api/admin/accounts')->assertJsonPath('data.0.disabled_at', fn ($at) => $at !== null);

        // A plan change fits the seats but never undoes a deactivation.
        app(Subscriptions::class)->apply($owner, Plan::query()->where('code', 'solo')->firstOrFail(), null);
        $this->assertNotNull($owner->fresh()->disabled_at);

        $this->postJson("/api/admin/accounts/{$owner->id}/reactivate")->assertOk()->assertJsonPath('data.disabled_at', null);
        $this->nextRequest()->withoutToken()->postJson('/api/mobile/login', ['email' => 'owner@example.com', 'password' => 'owner-pass-1', 'device_name' => 'Pixel 8'])->assertOk();
        $this->getJson("/api/output/{$link}")->assertOk();
    }

    public function test_deactivating_twice_keeps_the_first_date(): void
    {
        $admin = $this->admin();
        $owner = User::factory()->create();

        $first = $this->actingAs($admin)->postJson("/api/admin/accounts/{$owner->id}/deactivate")->json('data.disabled_at');
        $this->travel(5)->minutes();

        $this->postJson("/api/admin/accounts/{$owner->id}/deactivate")->assertOk()->assertJsonPath('data.disabled_at', $first);
    }
}
