<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_seller_can_create_an_account_and_is_signed_in(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Menard',
            'email' => 'Menard@Example.com',
            'password' => 'secret-pass-1',
            'password_confirmation' => 'secret-pass-1',
        ]);

        $response->assertCreated()->assertJsonPath('data.email', 'menard@example.com');
        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['email' => 'menard@example.com']);
    }

    public function test_registration_rejects_short_passwords_and_taken_emails(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/auth/register', [
            'name' => 'X',
            'email' => 'taken@example.com',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_login_with_the_right_password_starts_a_session(): void
    {
        $user = User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);

        $this->postJson('/api/auth/login', [
            'email' => 'SELLER@example.com',
            'password' => 'right-password',
            'remember' => true,
        ])->assertOk()->assertJsonPath('data.id', $user->id);

        $this->assertAuthenticatedAs($user);
    }

    public function test_login_with_a_wrong_password_gives_one_generic_message(): void
    {
        User::factory()->create(['email' => 'seller@example.com', 'password' => 'right-password']);

        $this->postJson('/api/auth/login', ['email' => 'seller@example.com', 'password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', "That email and password don't match. Try again, or reset your password.");

        $this->postJson('/api/auth/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', "That email and password don't match. Try again, or reset your password.");

        $this->assertGuest();
    }

    public function test_failed_logins_are_rate_limited(): void
    {
        User::factory()->create(['email' => 'seller@example.com']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'seller@example.com', 'password' => 'wrong-password'])
                ->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', ['email' => 'seller@example.com', 'password' => 'wrong-password'])
            ->assertStatus(429);
    }

    public function test_me_requires_a_session_and_logout_ends_it(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();

        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.email', $user->email);

        $this->postJson('/api/auth/logout')->assertNoContent();
        $this->assertGuest('web');
    }

    public function test_forgot_password_never_reveals_whether_an_account_exists(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'seller@example.com']);

        $this->postJson('/api/auth/forgot-password', ['email' => 'seller@example.com'])->assertOk();
        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user) {
            $url = $notification->toMail($user)->actionUrl;

            return str_starts_with($url, 'http://localhost:5173/reset-password?token=');
        });
    }

    public function test_a_reset_link_changes_the_password(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'seller@example.com']);
        $this->postJson('/api/auth/forgot-password', ['email' => 'seller@example.com']);

        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => 'seller@example.com',
            'password' => 'brand-new-pass',
            'password_confirmation' => 'brand-new-pass',
        ])->assertOk();

        $this->postJson('/api/auth/login', ['email' => 'seller@example.com', 'password' => 'brand-new-pass'])->assertOk();
    }

    public function test_theme_choice_is_saved_to_the_account(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/me/preferences', ['theme' => 'dark'])
            ->assertOk()->assertJsonPath('data.theme', 'dark');

        $this->actingAs($user)->patchJson('/api/me/preferences', ['theme' => 'neon'])
            ->assertUnprocessable();

        $this->assertSame('dark', $user->fresh()->theme);
    }
}
