<?php

namespace Tests\Feature;

use App\Models\Setup;
use App\Models\User;
use App\Services\SetupWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ForegroundTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function upload(User $user, string $kind = 'foreground'): int
    {
        return $this->actingAs($user)
            ->post('/api/media', ['kind' => $kind, 'file' => UploadedFile::fake()->image('banner.png', 1200, 200)])
            ->assertCreated()
            ->json('data.id');
    }

    /** The editor's "Save setup" document, as it loads it. */
    private function document(Setup $setup): array
    {
        $data = $this->getJson("/api/setups/{$setup->id}")->assertOk()->json('data');

        return [
            'name' => $data['name'],
            'orientation' => $data['orientation'],
            'resolution' => $data['resolution'],
            'camera' => $data['camera'],
            'background' => $data['background'],
            'foreground' => $data['foreground'],
            'sound_settings' => $data['sound_settings'],
            'output_settings' => $data['output_settings'],
            'popups' => array_map(fn ($p) => array_diff_key($p, ['media_url' => true]), $data['popups']),
        ];
    }

    private function scene(array $foreground): array
    {
        return [
            'orientation' => 'portrait',
            'see_through' => false,
            'camera' => ['source' => 'camera', 'device_label' => null, 'mirror' => false, 'brightness' => 50, 'zoom' => 0],
            'background' => ['mode' => 'image', 'preset' => 'rack', 'media_id' => null, 'key_color' => 'green', 'similarity' => 42, 'smoothness' => 18],
            'foreground' => $foreground,
            'popups' => [],
        ];
    }

    public function test_a_new_setup_has_the_foreground_off(): void
    {
        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);

        $this->actingAs($me)->getJson("/api/setups/{$setup->id}")
            ->assertOk()
            ->assertJsonPath('data.foreground', ['enabled' => false, 'media_id' => null, 'dock' => 'bottom'])
            ->assertJsonPath('data.scene.foreground.enabled', false);
    }

    public function test_a_foreground_image_is_saved_docked_top_or_bottom(): void
    {
        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);
        $image = $this->upload($me);

        $doc = $this->document($setup);
        $doc['foreground'] = ['enabled' => true, 'media_id' => $image, 'dock' => 'top'];
        $this->putJson("/api/setups/{$setup->id}", $doc)
            ->assertOk()
            ->assertJsonPath('data.foreground', ['enabled' => true, 'media_id' => $image, 'dock' => 'top']);

        $doc['foreground']['dock'] = 'middle';
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors('foreground.dock');
    }

    public function test_the_foreground_must_be_one_of_the_sellers_own_foreground_images(): void
    {
        $other = User::factory()->create();
        $theirs = $this->upload($other);

        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);
        $myPopupImage = $this->upload($me, 'image');
        $myBackgroundPhoto = $this->upload($me, 'background');

        $doc = $this->document($setup);
        foreach ([$theirs, $myPopupImage, $myBackgroundPhoto] as $wrong) {
            $doc['foreground'] = ['enabled' => true, 'media_id' => $wrong, 'dock' => 'bottom'];
            $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors('foreground.media_id');
        }
    }

    public function test_foreground_images_are_kept_apart_from_popup_images(): void
    {
        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);
        $foreground = $this->upload($me);

        $doc = $this->document($setup);
        $doc['popups'][] = [
            'key' => 'img-banner', 'kind' => 'image', 'preset_key' => null, 'label' => null, 'text' => null, 'color' => null,
            'media_id' => $foreground, 'position' => 'mc', 'x' => null, 'y' => null, 'size' => 100, 'entrance' => 'pop',
            'effect' => 'none', 'effect_repeat' => 'once', 'auto_hide' => 0, 'sound' => null,
        ];
        $last = count($doc['popups']) - 1;
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertUnprocessable()->assertJsonValidationErrors("popups.{$last}.media_id");
    }

    public function test_an_editor_from_before_foregrounds_can_still_save(): void
    {
        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);
        $this->actingAs($me);

        $doc = $this->document($setup);
        unset($doc['foreground']);
        $this->putJson("/api/setups/{$setup->id}", $doc)->assertOk()->assertJsonPath('data.foreground.enabled', false);
    }

    public function test_the_foreground_goes_live_with_its_image_and_can_be_hidden(): void
    {
        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);
        $image = $this->upload($me);

        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene(['enabled' => true, 'media_id' => $image, 'dock' => 'bottom']))
            ->assertOk()
            ->assertJsonPath('data.foreground.enabled', true)
            ->assertJsonPath('data.foreground.dock', 'bottom');
        $this->assertStringContainsString('/storage/', (string) $this->getJson("/api/setups/{$setup->id}/scene")->json('data.foreground.media_url'));

        $this->putJson("/api/setups/{$setup->id}/scene", $this->scene(['enabled' => false, 'media_id' => $image, 'dock' => 'bottom']))
            ->assertOk()
            ->assertJsonPath('data.foreground.enabled', false);
    }

    public function test_copying_someone_elses_setup_leaves_their_foreground_image_behind(): void
    {
        $owner = User::factory()->create();
        $source = app(SetupWriter::class)->createBlank($owner);
        $image = $this->upload($owner);
        $source->forceFill([
            'foreground' => ['enabled' => true, 'media_id' => $image, 'dock' => 'top'],
            'scene' => array_merge($source->scene, ['foreground' => ['enabled' => true, 'media_id' => $image, 'dock' => 'top']]),
            'is_template' => true,
            'user_id' => null,
        ])->save();

        $me = User::factory()->create();
        $copy = $this->actingAs($me)->postJson("/api/setups/{$source->id}/duplicate")->assertCreated();

        $copy->assertJsonPath('data.foreground', ['enabled' => false, 'media_id' => null, 'dock' => 'top']);
        $copy->assertJsonPath('data.scene.foreground.media_url', null);
    }
}
