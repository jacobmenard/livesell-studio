<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** The Android app opens the website (plans, payments) already signed in, via a one-time code. */
class WebHandoffTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['livesell.frontend_url' => 'https://app.negosyowork.example/']);
    }

    /** The app asks for a link with its token; returns the link's code and next page. */
    private function link(User $user, string $path = '/plans'): array
    {
        $url = $this->withToken($user->createToken('phone')->plainTextToken)
            ->postJson('/api/mobile/web-link', ['path' => $path])
            ->assertCreated()
            ->json('data.url');

        $this->assertStringStartsWith('https://app.negosyowork.example/handoff#', $url);
        parse_str((string) parse_url($url, PHP_URL_FRAGMENT), $fragment);

        // What follows happens in the browser: a guest, no token.
        $this->withoutToken();
        $this->app['auth']->forgetGuards();

        return $fragment;
    }

    private function claim(string $code): TestResponse
    {
        return $this->postJson('/api/auth/handoff', ['code' => $code]);
    }

    public function test_the_website_swaps_the_apps_code_once_for_a_signed_in_session(): void
    {
        $user = User::factory()->create();
        ['code' => $code, 'next' => $next] = $this->link($user);

        $this->assertSame('/plans', $next);
        $this->claim($code)->assertOk()->assertJsonPath('data.id', $user->id);
        $this->assertAuthenticatedAs($user, 'web');

        $this->app['auth']->guard('web')->logout();
        $this->claim($code)->assertUnprocessable()->assertJsonValidationErrors(['code']);
        $this->assertGuest('web');
    }

    public function test_a_code_stops_working_after_a_minute(): void
    {
        ['code' => $code] = $this->link(User::factory()->create());

        $this->travel(61)->seconds();
        $this->claim($code)->assertUnprocessable()->assertJsonValidationErrors(['code']);
        $this->assertGuest('web');
    }

    public function test_links_only_go_to_pages_of_the_website(): void
    {
        $token = User::factory()->create()->createToken('phone')->plainTextToken;

        foreach (['https://evil.example/plans', '//evil.example', 'plans', '/Plans?x=1', '/../plans'] as $path) {
            $this->withToken($token)->postJson('/api/mobile/web-link', ['path' => $path])
                ->assertUnprocessable()->assertJsonValidationErrors(['path']);
        }
    }

    public function test_only_a_signed_in_app_gets_a_link(): void
    {
        $this->postJson('/api/mobile/web-link', ['path' => '/plans'])->assertUnauthorized();
    }

    public function test_a_paused_sub_user_is_not_signed_in_by_a_code(): void
    {
        $user = User::factory()->create();
        ['code' => $code] = $this->link($user);
        $user->forceFill(['deactivated_at' => now()])->save();

        $this->claim($code)->assertUnprocessable()->assertJsonValidationErrors(['code']);
        $this->assertGuest('web');
    }
}
