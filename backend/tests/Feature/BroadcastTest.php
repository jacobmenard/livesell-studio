<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Setup;
use App\Models\User;
use App\Services\SetupWriter;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BroadcastTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-relay-secret-0123456789';

    private const KEY = 'FB-1234567890-ABCDEFGH';

    protected function setUp(): void
    {
        parent::setUp();
        config(['livesell.relay_secret' => self::SECRET]);
    }

    /** @return array{User, Setup} */
    private function sellerWithFacebook(): array
    {
        $user = User::factory()->create();
        $user->streamDestinations()->create([
            'platform' => 'facebook',
            'server_url' => 'rtmps://live-api-s.facebook.com:443/rtmp/',
            'stream_key' => self::KEY,
        ]);

        $setup = app(SetupWriter::class)->createBlank($user);
        // A paid plan (the free trial can't go live), then an open clean screen to stream from.
        app(Subscriptions::class)->apply($user, Plan::query()->where('code', 'solo')->firstOrFail(), null);
        $this->actingAs($user)->postJson("/api/setups/{$setup->id}/live-sessions")->assertCreated();

        return [$user, $setup];
    }

    private function ticketFor(User $user, Setup $setup): string
    {
        return $this->actingAs($user)
            ->postJson("/api/setups/{$setup->id}/broadcasts", ['platform' => 'facebook', 'orientation' => 'portrait', 'resolution' => '1080p'])
            ->assertCreated()
            ->json('data.ticket');
    }

    private function claim(string $ticket, string $secret = self::SECRET)
    {
        return $this->withToken($secret)->postJson('/api/relay/claim', ['ticket' => $ticket]);
    }

    public function test_the_relay_swaps_a_ticket_once_for_the_server_and_key(): void
    {
        [$user, $setup] = $this->sellerWithFacebook();
        $ticket = $this->ticketFor($user, $setup);

        $this->assertStringNotContainsString(self::KEY, $ticket);

        $this->claim($ticket)
            ->assertOk()
            ->assertJsonPath('data.server_url', 'rtmps://live-api-s.facebook.com:443/rtmp/')
            ->assertJsonPath('data.stream_key', self::KEY)
            ->assertJsonPath('data.orientation', 'portrait')
            ->assertJsonPath('data.resolution', '1080p');

        $this->claim($ticket)->assertNotFound();
    }

    public function test_the_ticket_response_never_contains_the_stream_key(): void
    {
        [$user, $setup] = $this->sellerWithFacebook();

        $response = $this->actingAs($user)
            ->postJson("/api/setups/{$setup->id}/broadcasts", ['platform' => 'facebook', 'orientation' => 'landscape', 'resolution' => '720p'])
            ->assertCreated();

        $this->assertStringNotContainsString(self::KEY, $response->getContent());
    }

    public function test_claiming_needs_the_relay_secret(): void
    {
        [$user, $setup] = $this->sellerWithFacebook();
        $ticket = $this->ticketFor($user, $setup);

        $this->postJson('/api/relay/claim', ['ticket' => $ticket])->assertUnauthorized();
        $this->claim($ticket, 'wrong-secret')->assertUnauthorized();

        // A refused attempt doesn't use the ticket up.
        $this->claim($ticket)->assertOk();
    }

    public function test_tickets_expire(): void
    {
        [$user, $setup] = $this->sellerWithFacebook();
        $ticket = $this->ticketFor($user, $setup);

        $this->travel(61)->seconds();

        $this->claim($ticket)->assertNotFound();
    }

    public function test_a_platform_without_a_saved_key_gets_a_clear_error(): void
    {
        [$user, $setup] = $this->sellerWithFacebook();

        $this->actingAs($user)
            ->postJson("/api/setups/{$setup->id}/broadcasts", ['platform' => 'youtube', 'orientation' => 'landscape', 'resolution' => '1080p'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('platform');
    }

    public function test_sellers_cannot_stream_someone_elses_setup(): void
    {
        [, $setup] = $this->sellerWithFacebook();
        $other = User::factory()->create();

        $this->actingAs($other)
            ->postJson("/api/setups/{$setup->id}/broadcasts", ['platform' => 'facebook', 'orientation' => 'landscape', 'resolution' => '1080p'])
            ->assertNotFound();
    }

    public function test_streaming_needs_the_clean_screen_open_so_it_counts_against_the_plan(): void
    {
        $user = User::factory()->create();
        $user->streamDestinations()->create(['platform' => 'facebook', 'server_url' => 'rtmps://live-api-s.facebook.com:443/rtmp/', 'stream_key' => self::KEY]);
        $setup = app(SetupWriter::class)->createBlank($user);

        $this->actingAs($user)
            ->postJson("/api/setups/{$setup->id}/broadcasts", ['platform' => 'facebook', 'orientation' => 'landscape', 'resolution' => '1080p'])
            ->assertStatus(409);
    }

    public function test_streaming_is_off_until_the_relay_secret_is_set(): void
    {
        config(['livesell.relay_secret' => null]);
        [$user, $setup] = $this->sellerWithFacebook();

        $this->actingAs($user)
            ->postJson("/api/setups/{$setup->id}/broadcasts", ['platform' => 'facebook', 'orientation' => 'landscape', 'resolution' => '1080p'])
            ->assertStatus(503);
        $this->withToken('')->postJson('/api/relay/claim', ['ticket' => str_repeat('a', 48)])->assertStatus(503);
    }
}
