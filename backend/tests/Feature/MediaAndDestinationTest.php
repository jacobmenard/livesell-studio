<?php

namespace Tests\Feature;

use App\Models\Media;
use App\Models\StreamDestination;
use App\Models\User;
use App\Services\SetupWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaAndDestinationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_uploading_a_popup_image_stores_a_re_encoded_copy(): void
    {
        $me = User::factory()->create();

        $response = $this->actingAs($me)->post('/api/media', [
            'kind' => 'image',
            'file' => UploadedFile::fake()->image('My Logo!!.png', 300, 200),
        ])->assertCreated();

        $media = Media::query()->findOrFail($response->json('data.id'));
        $this->assertSame('My Logo', $media->label);
        $this->assertSame('image/png', $media->mime);
        $this->assertSame(300, $media->width);
        Storage::disk('public')->assertExists($media->path);
        $this->assertStringStartsWith("media/{$me->id}/", $media->path);
    }

    public function test_uploads_check_the_real_file_type_and_size(): void
    {
        $me = User::factory()->create();
        $this->actingAs($me);

        // A text file renamed to .png is refused because its content isn't an image.
        $fake = UploadedFile::fake()->createWithContent('logo.png', 'not really an image');
        $this->post('/api/media', ['kind' => 'image', 'file' => $fake])
            ->assertUnprocessable()->assertJsonValidationErrors(['file']);

        $big = UploadedFile::fake()->image('big.jpg')->size(6000);
        $this->post('/api/media', ['kind' => 'background', 'file' => $big])
            ->assertUnprocessable()->assertJsonValidationErrors(['file']);

        // A sound is not a picture, whatever the kind asked for.
        $sound = UploadedFile::fake()->create('jingle.mp3', 10, 'audio/mpeg');
        $this->post('/api/media', ['kind' => 'background', 'file' => $sound])
            ->assertUnprocessable()->assertJsonValidationErrors(['file']);
    }

    public function test_only_the_owner_can_delete_an_upload_and_popups_using_it_go_too(): void
    {
        $me = User::factory()->create();
        $this->actingAs($me);
        $id = $this->post('/api/media', ['kind' => 'image', 'file' => UploadedFile::fake()->image('a.png')])->json('data.id');

        $setup = app(SetupWriter::class)->createBlank($me);
        DB::table('setup_popups')->insert([
            'setup_id' => $setup->id, 'key' => 'img-1', 'kind' => 'image', 'label' => 'a', 'media_id' => $id,
            'position' => 'mc', 'size' => 100, 'entrance' => 'pop', 'effect' => 'none', 'effect_repeat' => 'once',
            'auto_hide' => 0, 'sort_order' => 99, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs(User::factory()->create())->deleteJson("/api/media/{$id}")->assertNotFound();

        $this->actingAs($me)->deleteJson("/api/media/{$id}")->assertNoContent();
        $this->assertDatabaseMissing('media', ['id' => $id]);
        $this->assertDatabaseMissing('setup_popups', ['key' => 'img-1']);
    }

    public function test_gifs_can_be_backgrounds_and_foregrounds_and_stay_gifs_so_they_keep_moving(): void
    {
        $me = User::factory()->create();
        $this->actingAs($me);

        foreach (['background', 'foreground'] as $kind) {
            $id = $this->post('/api/media', ['kind' => $kind, 'file' => UploadedFile::fake()->image("moving-{$kind}.gif", 320, 180)])
                ->assertCreated()
                ->assertJsonPath('data.kind', $kind)
                ->json('data.id');

            $media = Media::query()->findOrFail($id);
            $this->assertSame('image/gif', $media->mime);
            $this->assertStringEndsWith('.gif', $media->path);
            // Stored as-is (GIFs aren't re-encoded), so every frame is kept.
            $this->assertStringStartsWith('GIF8', Storage::disk('public')->get($media->path));
        }
    }

    public function test_deleting_a_background_photo_puts_setups_back_on_their_built_in_background(): void
    {
        $me = User::factory()->create();
        $this->actingAs($me);
        $photo = $this->post('/api/media', ['kind' => 'background', 'file' => UploadedFile::fake()->image('shop.jpg', 640, 360)])->assertCreated()->json('data.id');
        $keep = $this->post('/api/media', ['kind' => 'background', 'file' => UploadedFile::fake()->image('other.jpg', 640, 360)])->json('data.id');

        $writer = app(SetupWriter::class);
        $using = $writer->createBlank($me);
        $usingBg = array_merge($using->background, ['mode' => 'image', 'preset' => 'kitchen', 'media_id' => $photo]);
        $using->forceFill(['background' => $usingBg, 'scene' => array_merge($using->scene, ['background' => $usingBg])])->save();
        $other = $writer->createBlank($me);
        $other->forceFill(['background' => array_merge($other->background, ['media_id' => $keep])])->save();
        $editedAt = $using->fresh()->updated_at;

        $this->travel(5)->minutes();
        $this->deleteJson("/api/media/{$photo}")->assertNoContent();

        $using = $using->fresh();
        $this->assertNull($using->background['media_id']);
        $this->assertSame('kitchen', $using->background['preset'], 'it keeps its built-in background');
        $this->assertNull($using->scene['background']['media_id']);
        $this->assertTrue($using->updated_at->equalTo($editedAt), 'not counted as an edit');
        $this->assertSame($keep, $other->fresh()->background['media_id'], 'setups using another photo are untouched');

        // The setup still saves (it no longer points at a missing photo).
        $data = $this->getJson("/api/setups/{$using->id}")->assertOk()->json('data');
        $doc = collect($data)->only(['name', 'orientation', 'resolution', 'camera', 'background', 'sound_settings', 'output_settings'])->all();
        $doc['popups'] = array_map(fn ($p) => array_diff_key($p, ['media_url' => true]), $data['popups']);
        $this->putJson("/api/setups/{$using->id}", $doc)->assertOk()->assertJsonPath('data.background.media_id', null);
    }

    public function test_a_setup_cannot_point_at_someone_elses_upload(): void
    {
        $other = User::factory()->create();
        $this->actingAs($other);
        $theirs = $this->post('/api/media', ['kind' => 'image', 'file' => UploadedFile::fake()->image('x.png')])->json('data.id');

        $me = User::factory()->create();
        $setup = app(SetupWriter::class)->createBlank($me);
        $this->actingAs($me);

        $this->putJson("/api/setups/{$setup->id}/scene", [
            'orientation' => 'landscape',
            'see_through' => false,
            'camera' => ['source' => 'camera', 'device_label' => null, 'mirror' => false, 'brightness' => 50, 'zoom' => 0],
            'background' => ['mode' => 'image', 'preset' => 'rack', 'media_id' => null, 'key_color' => 'green', 'similarity' => 42, 'smoothness' => 18],
            'popups' => [[
                'key' => 'img-x', 'kind' => 'image', 'media_id' => $theirs, 'position' => 'mc', 'size' => 100,
                'entrance' => 'pop', 'effect' => 'none', 'effect_repeat' => 'once', 'shown_at' => 1,
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['popups.0.media_id']);
    }

    public function test_stream_keys_are_encrypted_and_never_sent_back(): void
    {
        $me = User::factory()->create();
        $key = 'FB-1234567890-abcdEFGH';

        $this->actingAs($me)->putJson('/api/destinations/facebook', [
            'server_url' => 'rtmps://live-api-s.facebook.com:443/rtmp/',
            'stream_key' => $key,
        ])->assertOk()->assertJsonPath('data.key_hint', '••••EFGH')->assertJsonMissingPath('data.stream_key');

        $raw = DB::table('stream_destinations')->where('user_id', $me->id)->value('stream_key');
        $this->assertNotSame($key, $raw);
        $this->assertSame($key, StreamDestination::query()->where('user_id', $me->id)->firstOrFail()->stream_key);

        $listed = $this->getJson('/api/destinations')->assertOk()->getContent();
        $this->assertStringNotContainsString($key, $listed);
    }

    public function test_stream_form_checks_server_and_key(): void
    {
        $me = User::factory()->create();

        $this->actingAs($me)->putJson('/api/destinations/youtube', [
            'server_url' => 'https://a.rtmp.youtube.com/live2',
            'stream_key' => 'has spaces in it',
        ])->assertUnprocessable()->assertJsonValidationErrors(['server_url', 'stream_key']);

        $this->putJson('/api/destinations/myspace', [
            'server_url' => 'rtmp://a.rtmp.youtube.com/live2',
            'stream_key' => 'abc',
        ])->assertNotFound();
    }
}
