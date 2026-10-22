<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use App\Services\SetupWriter;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/** The Android app: bearer-token sign-in against the same API the website uses. */
class MobileAuthTest extends TestCase
{
    use RefreshDatabase;

    private function login(string $email, string $password, string $device = 'Pixel 8')
    {
        return $this->postJson('/api/mobile/login', ['email' => $email, 'password' => $password, 'device_name' => $device]);
    }

    /** Requests after this one look up the token again, like a new request from the phone. */
    private function fresh(): void
    {
        $this->app['auth']->forgetGuards();
    }

    public function test_login_returns_a_token_that_opens_the_api(): void
    {
        $user = User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);

        $token = $this->login('SELLER@example.com', 'right-password')
            ->assertOk()
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonStructure(['data' => ['token', 'expires_at', 'user' => ['id', 'email', 'account_name']]])
            ->json('data.token');

        $this->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.email', 'seller@example.com');
        $this->withToken($token)->getJson('/api/setups')->assertOk();
        // Only a hash is stored, never the token itself.
        $this->assertDatabaseMissing('personal_access_tokens', ['token' => explode('|', $token, 2)[1]]);
    }

    public function test_a_wrong_password_or_unknown_email_gives_one_generic_message(): void
    {
        User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);
        $message = "That email and password don't match. Try again, or reset your password.";

        $this->login('seller@example.com', 'wrong')->assertUnprocessable()->assertJsonPath('errors.email.0', $message);
        $this->login('nobody@example.com', 'wrong')->assertUnprocessable()->assertJsonPath('errors.email.0', $message);
        $this->assertSame(0, PersonalAccessToken::query()->count());
    }

    public function test_the_device_name_is_required(): void
    {
        User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);

        $this->postJson('/api/mobile/login', ['email' => 'seller@example.com', 'password' => 'right-password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['device_name']);
    }

    public function test_register_creates_an_account_with_the_free_week_and_a_token(): void
    {
        $token = $this->postJson('/api/mobile/register', [
            'name' => 'Joy',
            'email' => 'Joy@Shop.ph',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
            'device_name' => 'Redmi Note 13',
        ])->assertCreated()->assertJsonPath('data.user.email', 'joy@shop.ph')->json('data.token');

        $this->assertNotNull(User::query()->where('email', 'joy@shop.ph')->value('trial_ends_at'));
        $this->withToken($token)->getJson('/api/auth/me')->assertOk();
    }

    public function test_logout_turns_off_only_this_phone(): void
    {
        User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);
        $phone = $this->login('seller@example.com', 'right-password', 'Phone')->json('data.token');
        $tablet = $this->login('seller@example.com', 'right-password', 'Tablet')->json('data.token');

        $this->withToken($phone)->postJson('/api/mobile/logout')->assertNoContent();
        $this->fresh();

        $this->withToken($phone)->getJson('/api/auth/me')->assertUnauthorized();
        $this->fresh();
        $this->withToken($tablet)->getJson('/api/auth/me')->assertOk();
    }

    public function test_only_the_newest_phones_stay_signed_in(): void
    {
        $user = User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);
        $first = $this->login('seller@example.com', 'right-password', 'Old phone')->json('data.token');
        // Four more phones (made directly: five logins a minute is the rate limit), then a sixth signs in.
        for ($i = 0; $i < 4; $i++) {
            $user->createToken("Phone {$i}");
        }
        $this->login('seller@example.com', 'right-password', 'New phone')->assertOk();

        $this->assertSame(5, PersonalAccessToken::query()->count());
        $this->fresh();
        $this->withToken($first)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_a_paused_member_cannot_sign_in_and_loses_open_tokens(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create(['email' => 'helper@example.com', 'password' => 'helper-pass-1']);
        $member->forceFill(['owner_id' => $owner->id])->save();
        $token = $this->login('helper@example.com', 'helper-pass-1')->assertOk()->json('data.token');

        $member->forceFill(['deactivated_at' => now()])->save();
        $this->fresh();

        $this->withToken($token)->getJson('/api/setups')->assertForbidden()->assertJsonPath('message', fn ($m) => str_contains($m, 'paused'));
        $this->assertSame(0, $member->tokens()->count());
        $this->login('helper@example.com', 'helper-pass-1')->assertUnprocessable()->assertJsonPath('errors.email.0', fn ($m) => str_contains($m, 'paused'));
    }

    public function test_the_app_needs_a_paid_plan_to_go_live_and_gets_no_preview(): void
    {
        $me = User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);
        $setup = app(SetupWriter::class)->createBlank($me);
        $token = $this->login('seller@example.com', 'right-password')->json('data.token');

        $this->withToken($token)->postJson("/api/setups/{$setup->id}/live-sessions", ['source' => 'app'])
            ->assertStatus(409)
            ->assertJsonPath('preview', false);

        app(Subscriptions::class)->apply($me, Plan::query()->where('code', 'solo')->firstOrFail(), null);
        $this->fresh();

        $id = $this->withToken($token)->postJson("/api/setups/{$setup->id}/live-sessions", ['source' => 'app'])
            ->assertCreated()
            ->json('data.id');
        $this->assertDatabaseHas('live_sessions', ['id' => $id, 'source' => 'app']);
        $this->withToken($token)->deleteJson("/api/live-sessions/{$id}")->assertNoContent();
    }

    public function test_an_unknown_live_source_is_rejected(): void
    {
        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);

        $this->actingAs($me)->postJson("/api/setups/{$setup->id}/live-sessions", ['source' => 'link'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['source']);
    }

    public function test_the_version_check_needs_no_login_and_only_gives_https_links(): void
    {
        config(['livesell.android_app' => [
            'version_code' => 3, 'version_name' => '1.2.0', 'min_version_code' => 2,
            'apk_url' => 'https://negosyowork.example/app.apk', 'size_mb' => 42.5, 'notes' => ['Smoother reconnect'],
        ]]);

        $this->getJson('/api/mobile/version')
            ->assertOk()
            ->assertJsonPath('data.version_code', 3)
            ->assertJsonPath('data.min_version_code', 2)
            ->assertJsonPath('data.apk_url', 'https://negosyowork.example/app.apk')
            ->assertJsonPath('data.notes.0', 'Smoother reconnect');

        config(['livesell.android_app.apk_url' => 'http://negosyowork.example/app.apk']);
        $this->getJson('/api/mobile/version')->assertOk()->assertJsonPath('data.apk_url', null);
    }

    public function test_a_new_password_signs_every_phone_out(): void
    {
        $user = User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);
        $this->login('seller@example.com', 'right-password')->assertOk();

        $token = app('auth.password.broker')->createToken($user);
        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => 'seller@example.com',
            'password' => 'brand-new-pass',
            'password_confirmation' => 'brand-new-pass',
        ])->assertOk();

        $this->assertSame(0, $user->tokens()->count());
    }
}
