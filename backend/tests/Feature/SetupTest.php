<?php

namespace Tests\Feature;

use App\Models\Setup;
use App\Models\User;
use App\Services\SetupWriter;
use App\Support\Catalog;
use Database\Seeders\TemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SetupTest extends TestCase
{
    use RefreshDatabase;

    private function blank(User $user, string $name = 'Saturday sale setup'): Setup
    {
        return app(SetupWriter::class)->createBlank($user, $name);
    }

    /** The document the editor sends on "Save setup", built from a fresh setup. */
    private function document(Setup $setup): array
    {
        $data = $this->getJson("/api/setups/{$setup->id}")->assertOk()->json('data');

        return [
            'name' => $data['name'],
            'orientation' => $data['orientation'],
            'resolution' => $data['resolution'],
            'camera' => $data['camera'],
            'background' => $data['background'],
            'sound_settings' => $data['sound_settings'],
            'output_settings' => $data['output_settings'],
            'popups' => array_map(fn ($p) => array_diff_key($p, ['media_url' => true]), $data['popups']),
        ];
    }

    public function test_the_dashboard_lists_own_setups_and_templates_but_not_other_sellers(): void
    {
        $this->seed(TemplateSeeder::class);
        $me = User::factory()->create();
        $other = User::factory()->create();
        $mine = $this->blank($me);
        $theirs = $this->blank($other, 'Not mine');

        $ids = collect($this->actingAs($me)->getJson('/api/setups')->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($mine->id));
        $this->assertFalse($ids->contains($theirs->id));
        $this->assertSame(6, Setup::query()->where('is_template', true)->count());
        $this->assertCount(7, $ids);
    }

    public function test_a_new_setup_starts_with_the_nine_built_in_popups(): void
    {
        $me = User::factory()->create();

        $response = $this->actingAs($me)->postJson('/api/setups', ['name' => 'Kusina live'])->assertCreated();

        $keys = collect($response->json('data.popups'))->pluck('key')->all();
        $this->assertSame(Catalog::presetKeys(), $keys);
        $this->assertSame('Kusina live', $response->json('data.name'));
    }

    public function test_using_a_template_copies_it_into_the_sellers_account(): void
    {
        $this->seed(TemplateSeeder::class);
        $me = User::factory()->create();
        $template = Setup::query()->where('name', '11.11 Mega sale')->firstOrFail();

        $response = $this->actingAs($me)->postJson('/api/setups', ['from_setup_id' => $template->id])->assertCreated();

        $this->assertFalse($response->json('data.is_template'));
        $this->assertSame('11.11 Mega sale', $response->json('data.name'));
        $this->assertContains('sale1111', collect($response->json('data.popups'))->pluck('key')->all());
        $this->assertCount(2, $response->json('data.scene.popups'));
        $this->assertTrue($template->fresh()->is_template, 'the template itself is untouched');
    }

    public function test_saving_updates_settings_and_popups_and_keeps_built_ins(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me);
        $this->actingAs($me);

        $doc = $this->document($setup);
        $doc['name'] = 'Flash sale night';
        $doc['orientation'] = 'portrait';
        $doc['camera']['mirror'] = true;
        $doc['background']['mode'] = 'green';
        // Drop a built-in popup (it must come back) and add a text popup.
        $doc['popups'] = array_values(array_filter($doc['popups'], fn ($p) => $p['key'] !== 'sold'));
        $doc['popups'][] = [
            'key' => 'txt-99only', 'kind' => 'text', 'preset_key' => null, 'label' => null,
            'text' => '₱99 ONLY', 'color' => 'yellow', 'media_id' => null,
            'position' => 'mc', 'size' => 158, 'entrance' => 'bounce', 'effect' => 'confetti',
            'effect_repeat' => 'once', 'auto_hide' => 5, 'sound' => 'kaching',
        ];

        $response = $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk();

        $this->assertSame('Flash sale night', $response->json('data.name'));
        $this->assertSame('portrait', $response->json('data.orientation'));
        $this->assertTrue($response->json('data.camera.mirror'));
        $keys = collect($response->json('data.popups'))->pluck('key');
        $this->assertTrue($keys->contains('sold'), 'built-in popups cannot be removed');
        $this->assertTrue($keys->contains('txt-99only'));
        $this->assertDatabaseHas('setup_popups', ['setup_id' => $setup->id, 'key' => 'txt-99only', 'label' => '₱99 ONLY', 'sound' => 'kaching']);

        // Removing the custom popup on the next save deletes it.
        $doc['popups'] = array_values(array_filter($doc['popups'], fn ($p) => $p['key'] !== 'txt-99only'));
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk();
        $this->assertDatabaseMissing('setup_popups', ['setup_id' => $setup->id, 'key' => 'txt-99only']);
    }

    public function test_saving_rejects_unknown_values_and_long_text(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me);
        $this->actingAs($me);
        $doc = $this->document($setup);

        $bad = $doc;
        $bad['popups'][] = [
            'key' => 'txt-long', 'kind' => 'text', 'text' => str_repeat('A', 25), 'color' => 'purple',
            'position' => 'xx', 'size' => 'XL', 'entrance' => 'pop', 'effect' => 'lasers',
            'effect_repeat' => 'once', 'auto_hide' => 7, 'sound' => 'https://evil.example/x.mp3',
        ];
        $bad['background']['mode'] = 'video';

        $this->putJson("/api/setups/{$setup->id}", $bad)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'popups.9.text', 'popups.9.color', 'popups.9.position', 'popups.9.size',
                'popups.9.effect', 'popups.9.auto_hide', 'popups.9.sound', 'background.mode',
            ]);
    }

    public function test_sellers_cannot_see_change_or_delete_someone_elses_setup(): void
    {
        $owner = User::factory()->create();
        $setup = $this->blank($owner);
        $intruder = User::factory()->create();
        $this->actingAs($owner);
        $doc = $this->document($setup);

        $this->actingAs($intruder);
        $this->getJson("/api/setups/{$setup->id}")->assertNotFound();
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertNotFound();
        $this->deleteJson("/api/setups/{$setup->id}")->assertNotFound();
        $this->postJson("/api/setups/{$setup->id}/duplicate")->assertNotFound();
        $this->postJson('/api/setups', ['from_setup_id' => $setup->id])->assertNotFound();

        $this->assertDatabaseHas('setups', ['id' => $setup->id]);
    }

    public function test_templates_can_be_copied_but_not_edited_or_deleted(): void
    {
        $this->seed(TemplateSeeder::class);
        $me = User::factory()->create();
        $template = Setup::query()->where('is_template', true)->firstOrFail();
        $this->actingAs($me);

        $this->getJson("/api/setups/{$template->id}")->assertOk();
        $this->deleteJson("/api/setups/{$template->id}")->assertNotFound();
        $this->postJson("/api/setups/{$template->id}/duplicate")->assertCreated();
    }

    public function test_duplicate_and_delete_own_setup(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me, 'Giveaway hour');
        $this->actingAs($me);

        $copy = $this->postJson("/api/setups/{$setup->id}/duplicate")->assertCreated()->json('data');
        $this->assertSame('Giveaway hour (copy)', $copy['name']);
        $this->assertCount(9, $copy['popups']);

        $this->deleteJson("/api/setups/{$setup->id}")->assertNoContent();
        $this->assertDatabaseMissing('setups', ['id' => $setup->id]);
        $this->assertDatabaseMissing('setup_popups', ['setup_id' => $setup->id]);
    }

    public function test_camera_sound_is_on_by_default_and_can_be_turned_off(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me);
        $this->actingAs($me);

        $doc = $this->document($setup);
        $this->assertTrue($doc['camera']['audio']);

        $doc['camera']['audio'] = false;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk()->assertJsonPath('data.camera.audio', false);
        $this->assertFalse($setup->fresh()->camera['audio']);

        $doc['camera']['audio'] = 'loud';
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors('camera.audio');
    }

    public function test_the_camera_can_be_zoomed_out_but_not_past_the_limits(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me);
        $this->actingAs($me);

        $doc = $this->document($setup);
        $doc['orientation'] = 'portrait';
        $doc['camera']['zoom'] = -60;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk()->assertJsonPath('data.camera.zoom', -60);

        $doc['camera']['zoom'] = -101;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors('camera.zoom');
    }

    public function test_popups_can_be_any_size_within_the_limits(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me);
        $this->actingAs($me);

        $doc = $this->document($setup);
        $this->assertSame(100, $doc['popups'][0]['size'], 'new popups start at the old "Medium"');

        $doc['popups'][0]['size'] = 135;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk()->assertJsonPath('data.popups.0.size', 135);
        $this->assertDatabaseHas('setup_popups', ['setup_id' => $setup->id, 'key' => $doc['popups'][0]['key'], 'size' => 135]);

        foreach ([39, 1501, 'L', 12.5] as $bad) {
            $doc['popups'][0]['size'] = $bad;
            $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors('popups.0.size');
        }
    }

    public function test_popups_dragged_on_the_preview_keep_their_free_position(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me);
        $this->actingAs($me);

        $doc = $this->document($setup);
        $this->assertNull($doc['popups'][0]['x'], 'popups start on their 9-spot position');

        $doc['popups'][0]['x'] = 37.25;
        $doc['popups'][0]['y'] = 81.5;
        $this->putJson("/api/setups/{$setup->id}", $doc)
            ->assertOk()
            ->assertJsonPath('data.popups.0.x', 37.25)
            ->assertJsonPath('data.popups.0.y', 81.5);

        // Picking a spot again clears the free position.
        $doc['popups'][0]['x'] = null;
        $doc['popups'][0]['y'] = null;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk()->assertJsonPath('data.popups.0.x', null);

        $doc['popups'][0]['x'] = 40;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors('popups.0.y');

        $doc['popups'][0]['y'] = 120;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors('popups.0.y');
    }

    public function test_setups_saved_before_camera_sound_existed_load_and_save_with_it_on(): void
    {
        $me = User::factory()->create();
        $setup = $this->blank($me);
        $setup->forceFill(['camera' => ['source' => 'camera', 'device_label' => null, 'mirror' => true, 'brightness' => 50, 'zoom' => 0]])->save();
        $this->actingAs($me);

        $doc = $this->document($setup);
        $this->assertTrue($doc['camera']['audio']);
        $this->assertTrue($doc['camera']['mirror']);

        // An editor opened before the update doesn't send the field at all.
        unset($doc['camera']['audio']);
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk()->assertJsonPath('data.camera.audio', true);
    }
}
