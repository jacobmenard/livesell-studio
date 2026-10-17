<?php

namespace Tests\Feature;

use App\Events\SceneUpdated;
use App\Events\SoundPlayed;
use App\Models\OutputLink;
use App\Models\Setup;
use App\Models\User;
use App\Services\SetupWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class LiveTest extends TestCase
{
    use RefreshDatabase;

    private function scene(array $popups = []): array
    {
        return [
            'orientation' => 'portrait',
            'see_through' => false,
            'camera' => ['source' => 'camera', 'device_label' => 'HD Webcam', 'mirror' => false, 'brightness' => 55, 'zoom' => 10],
            'background' => ['mode' => 'image', 'preset' => 'kitchen', 'media_id' => null, 'key_color' => 'green', 'similarity' => 42, 'smoothness' => 18],
            'popups' => $popups,
        ];
    }

    private function off10(int $shownAt = 1): array
    {
        return [
            'key' => 'off10', 'kind' => 'preset', 'preset_key' => 'off10', 'label' => null, 'text' => null,
            'color' => null, 'media_id' => null, 'position' => 'tr', 'size' => 158, 'entrance' => 'pop',
            'effect' => 'fireworks', 'effect_repeat' => 'loop', 'shown_at' => $shownAt,
        ];
    }

    private function setupFor(User $user): Setup
    {
        return app(SetupWriter::class)->createBlank($user);
    }

    public function test_showing_a_popup_saves_the_scene_and_broadcasts_it(): void
    {
        Event::fake([SceneUpdated::class]);
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $editedAt = $setup->updated_at;

        $this->travel(5)->minutes();
        $response = $this->actingAs($me)->putJson("/api/setups/{$setup->id}/scene", $this->scene([$this->off10()]))
            ->assertOk();

        $this->assertSame('off10', $response->json('data.popups.0.key'));
        $this->assertSame('10% OFF', $response->json('data.popups.0.label'));
        $this->assertSame('portrait', $setup->fresh()->scene['orientation']);
        $this->assertTrue($setup->fresh()->updated_at->equalTo($editedAt), 'live changes are not "edits"');

        Event::assertDispatched(SceneUpdated::class, function (SceneUpdated $e) use ($setup) {
            $names = array_map(fn ($c) => $c->name, $e->broadcastOn());

            return $e->setupId === $setup->id && $names === ['private-setup.'.$setup->id];
        });
    }

    public function test_without_reverb_keys_a_popup_tap_does_not_wait_on_a_websocket(): void
    {
        config(['broadcasting.connections.reverb.key' => null]);
        Event::fake([SceneUpdated::class]);
        $me = User::factory()->create();
        $setup = $this->setupFor($me);

        $this->actingAs($me)->putJson("/api/setups/{$setup->id}/scene", $this->scene([$this->off10()]))
            ->assertOk()
            ->assertJsonPath('meta.delivered', false);

        Event::assertNotDispatched(SceneUpdated::class);
    }

    public function test_after_reverb_fails_the_next_taps_skip_it_for_a_while(): void
    {
        // Nothing listens on the test Reverb port, so the first send fails.
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me)->putJson("/api/setups/{$setup->id}/scene", $this->scene())->assertJsonPath('meta.delivered', false);

        Event::fake([SceneUpdated::class]);
        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene([$this->off10()]))->assertOk()->assertJsonPath('meta.delivered', false);
        Event::assertNotDispatched(SceneUpdated::class);

        $this->travel(16)->seconds();
        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene())->assertJsonPath('meta.delivered', true);
        Event::assertDispatched(SceneUpdated::class);
    }

    public function test_the_clean_screen_gets_the_camera_look_and_older_pictures_show_unchanged(): void
    {
        Event::fake([SceneUpdated::class]);
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me);

        // A picture sent by an editor from before the look existed.
        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene())->assertOk()
            ->assertJsonPath('data.camera.contrast', 50)
            ->assertJsonPath('data.camera.smoothing', 0);

        $scene = $this->scene();
        $scene['camera'] += ['contrast' => 47, 'saturation' => 52, 'warmth' => 66, 'smoothing' => 65];
        $this->putJson("/api/setups/{$setup->id}/scene", $scene)->assertOk();

        $this->getJson("/api/setups/{$setup->id}/scene")->assertOk()
            ->assertJsonPath('data.camera.warmth', 66)
            ->assertJsonPath('data.camera.smoothing', 65)
            ->assertJsonPath('data.camera.effect', 'none');
    }

    public function test_a_face_effect_goes_live_and_unknown_ones_are_refused(): void
    {
        Event::fake([SceneUpdated::class]);
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me);

        $scene = $this->scene();
        $scene['camera']['effect'] = 'flower-crown';
        $this->putJson("/api/setups/{$setup->id}/scene", $scene)->assertOk()->assertJsonPath('data.camera.effect', 'flower-crown');

        $scene['camera']['effect'] = 'laser-eyes';
        $this->putJson("/api/setups/{$setup->id}/scene", $scene)->assertUnprocessable()->assertJsonValidationErrors('camera.effect');
    }

    public function test_a_colour_filter_goes_live_with_its_strength_and_older_pictures_have_none(): void
    {
        Event::fake([SceneUpdated::class]);
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me);

        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene())->assertOk()
            ->assertJsonPath('data.camera.filter', 'none')
            ->assertJsonPath('data.camera.filter_strength', 80);

        $scene = $this->scene();
        $scene['camera'] += ['filter' => 'vintage', 'filter_strength' => 65];
        $this->putJson("/api/setups/{$setup->id}/scene", $scene)->assertOk()
            ->assertJsonPath('data.camera.filter', 'vintage')
            ->assertJsonPath('data.camera.filter_strength', 65);

        $bad = $scene;
        $bad['camera']['filter'] = 'sepia-plus';
        $bad['camera']['filter_strength'] = 120;
        $this->putJson("/api/setups/{$setup->id}/scene", $bad)->assertUnprocessable()->assertJsonValidationErrors(['camera.filter', 'camera.filter_strength']);
    }

    public function test_scene_updates_also_reach_the_active_output_link(): void
    {
        Event::fake([SceneUpdated::class]);
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me)->postJson("/api/setups/{$setup->id}/output-link")->assertCreated();
        $publicId = OutputLink::query()->where('setup_id', $setup->id)->value('public_id');

        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene())->assertOk();

        Event::assertDispatched(SceneUpdated::class, fn (SceneUpdated $e) => $e->outputPublicId === $publicId);
    }

    public function test_scene_rejects_bad_popups_and_too_many_on_screen(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me);

        $html = $this->off10();
        $html['kind'] = 'text';
        $html['key'] = 'txt-x';
        $html['text'] = "<img src=x onerror=alert(1)>\x07";
        $html['color'] = 'yellow';
        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene([$html]))
            ->assertUnprocessable()->assertJsonValidationErrors(['popups.0.text']);

        $many = [];
        for ($i = 0; $i < 13; $i++) {
            $many[] = array_merge($this->off10(), ['key' => 'k'.$i, 'kind' => 'text', 'text' => 'HI', 'color' => 'blue', 'preset_key' => null]);
        }
        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene($many))
            ->assertUnprocessable()->assertJsonValidationErrors(['popups']);
    }

    public function test_another_seller_cannot_drive_my_live(): void
    {
        $setup = $this->setupFor(User::factory()->create());

        $this->actingAs(User::factory()->create())
            ->putJson("/api/setups/{$setup->id}/scene", $this->scene())
            ->assertNotFound();
    }

    public function test_sounds_are_broadcast_with_volume(): void
    {
        Event::fake([SoundPlayed::class]);
        $me = User::factory()->create();
        $setup = $this->setupFor($me);

        $this->actingAs($me)->postJson("/api/setups/{$setup->id}/sounds", ['sound' => 'kaching', 'volume' => 80])->assertOk();
        $this->postJson("/api/setups/{$setup->id}/sounds", ['sound' => 'media:999', 'volume' => 80])->assertUnprocessable();
        $this->postJson("/api/setups/{$setup->id}/sounds", ['sound' => 'nope', 'volume' => 80])->assertUnprocessable();

        Event::assertDispatched(SoundPlayed::class, fn (SoundPlayed $e) => $e->sound === 'kaching' && $e->volume === 80);
        Event::assertDispatchedTimes(SoundPlayed::class, 1);
    }

    public function test_output_link_token_is_shown_once_and_stored_only_as_a_hash(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);

        $created = $this->actingAs($me)->postJson("/api/setups/{$setup->id}/output-link")->assertCreated()->json('data');
        $token = $created['token'];

        $this->assertSame(48, strlen($token));
        $this->assertSame('http://localhost:5173/output/'.$token, $created['url']);
        $this->assertDatabaseMissing('output_links', ['token_hash' => $token]);
        $this->assertDatabaseHas('output_links', ['token_hash' => hash('sha256', $token)]);
        $this->getJson("/api/setups/{$setup->id}/output-link")->assertOk()
            ->assertJsonPath('data.active', true)->assertJsonMissingPath('data.token');
    }

    public function test_the_clean_screen_reads_the_scene_with_its_token_and_a_new_link_turns_the_old_one_off(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me)->putJson("/api/setups/{$setup->id}/scene", $this->scene([$this->off10()]))->assertOk();
        $old = $this->postJson("/api/setups/{$setup->id}/output-link")->json('data.token');

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/output/{$old}")->assertOk()->assertJsonPath('data.scene.popups.0.key', 'off10');

        $this->actingAs($me)->postJson("/api/setups/{$setup->id}/output-link")->assertCreated();
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/output/{$old}")->assertNotFound();
        $this->getJson('/api/output/'.str_repeat('a', 48))->assertNotFound();
    }

    public function test_a_link_can_only_sign_into_its_own_channel(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $token = $this->actingAs($me)->postJson("/api/setups/{$setup->id}/output-link")->json('data.token');
        $publicId = OutputLink::query()->where('setup_id', $setup->id)->value('public_id');
        $this->app['auth']->forgetGuards();

        $ok = $this->postJson("/api/output/{$token}/auth", [
            'socket_id' => '123.456',
            'channel_name' => 'private-output.'.$publicId,
        ])->assertOk();
        $this->assertStringStartsWith('test-key:', $ok->json('auth'));

        $this->postJson("/api/output/{$token}/auth", [
            'socket_id' => '123.456',
            'channel_name' => 'private-setup.'.$setup->id,
        ])->assertForbidden();
    }

    public function test_session_users_cannot_subscribe_to_output_channels(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me)->postJson("/api/setups/{$setup->id}/output-link");
        $publicId = OutputLink::query()->where('setup_id', $setup->id)->value('public_id');

        $this->postJson('/api/broadcasting/auth', ['socket_id' => '1.2', 'channel_name' => 'private-output.'.$publicId])
            ->assertForbidden();
        $this->postJson('/api/broadcasting/auth', ['socket_id' => '1.2', 'channel_name' => 'private-setup.'.$setup->id])
            ->assertOk();
    }

    public function test_the_clean_screen_is_told_whether_to_send_camera_sound(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me);

        // Older editors leave the field out: sound stays on.
        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene())->assertOk()->assertJsonPath('data.camera.audio', true);

        $scene = $this->scene();
        $scene['camera']['audio'] = false;
        $this->putJson("/api/setups/{$setup->id}/scene", $scene)->assertOk()->assertJsonPath('data.camera.audio', false);
        $this->getJson("/api/setups/{$setup->id}/scene")->assertOk()->assertJsonPath('data.camera.audio', false);
    }

    public function test_live_scenes_saved_with_the_old_sizes_still_show_at_the_same_size(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $saved = $this->scene([array_merge($this->off10(), ['size' => 'L'])]);
        $setup->forceFill(['scene' => $saved])->save();

        $this->actingAs($me)->getJson("/api/setups/{$setup->id}/scene")->assertOk()->assertJsonPath('data.popups.0.size', 158);
    }

    public function test_a_dragged_popup_goes_live_at_its_free_position_and_size(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);

        $this->actingAs($me)
            ->putJson("/api/setups/{$setup->id}/scene", $this->scene([array_merge($this->off10(), ['x' => 22.5, 'y' => 64, 'size' => 140])]))
            ->assertOk()
            ->assertJsonPath('data.popups.0.x', 22.5)
            ->assertJsonPath('data.popups.0.y', 64)
            ->assertJsonPath('data.popups.0.size', 140);
    }
}
