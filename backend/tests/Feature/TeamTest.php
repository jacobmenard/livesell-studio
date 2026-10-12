<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use App\Services\SetupWriter;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TeamTest extends TestCase
{
    use RefreshDatabase;

    private function onPlan(User $account, string $code): void
    {
        app(Subscriptions::class)->apply($account, Plan::query()->where('code', $code)->firstOrFail(), null);
    }

    private function add(User $owner, string $email)
    {
        return $this->actingAs($owner)->postJson('/api/team', ['name' => 'Ana', 'email' => $email, 'password' => 'helper-pass-1']);
    }

    public function test_solo_has_no_sub_users_and_duo_has_one(): void
    {
        $owner = User::factory()->create();
        $this->onPlan($owner, 'solo');

        $this->add($owner, 'one@example.com')->assertUnprocessable()->assertJsonPath('errors.email.0', "Your Solo plan doesn't include sub-users. Upgrade to add your team.");

        $this->onPlan($owner, 'duo');
        $this->add($owner, 'one@example.com')->assertCreated()->assertJsonPath('data.seats', 1)->assertJsonPath('data.members.0.email', 'one@example.com');
        $this->add($owner, 'two@example.com')->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_a_sub_user_works_in_the_owners_account(): void
    {
        Storage::fake('public');
        $owner = User::factory()->create();
        $this->onPlan($owner, 'duo');
        $setup = app(SetupWriter::class)->createBlank($owner, 'Owner setup');
        $this->add($owner, 'helper@example.com')->assertCreated();
        $member = User::query()->where('email', 'helper@example.com')->firstOrFail();

        $this->flushSession(); // the helper signs in on their own browser
        $this->postJson('/api/auth/login', ['email' => 'helper@example.com', 'password' => 'helper-pass-1'])
            ->assertOk()
            ->assertJsonPath('data.is_subuser', true)
            ->assertJsonPath('data.account_name', $owner->name);

        // Sees and opens the owner's setups; what they create or upload belongs to the owner.
        $this->actingAs($member)->getJson('/api/setups')->assertOk()->assertJsonFragment(['name' => 'Owner setup']);
        $this->getJson("/api/setups/{$setup->id}")->assertOk();
        $created = $this->postJson('/api/setups', ['name' => 'Made by helper'])->assertCreated()->json('data.id');
        $this->assertDatabaseHas('setups', ['id' => $created, 'user_id' => $owner->id]);
        $media = $this->post('/api/media', ['kind' => 'image', 'file' => UploadedFile::fake()->image('a.png')])->assertCreated()->json('data.id');
        $this->assertDatabaseHas('media', ['id' => $media, 'user_id' => $owner->id]);
    }

    public function test_a_sub_user_cannot_manage_the_team_the_plan_or_stream_keys(): void
    {
        $owner = User::factory()->create();
        $this->onPlan($owner, 'duo');
        $owner->streamDestinations()->create(['platform' => 'facebook', 'server_url' => 'rtmps://live-api-s.facebook.com:443/rtmp/', 'stream_key' => 'FB-SECRET-KEY-123456']);
        $member = User::factory()->create();
        $member->forceFill(['owner_id' => $owner->id])->save();
        $this->actingAs($member);

        $this->getJson('/api/team')->assertForbidden();
        $this->postJson('/api/team', ['name' => 'X', 'email' => 'x@example.com', 'password' => 'password-123'])->assertForbidden();
        $this->putJson('/api/destinations/facebook', ['server_url' => 'rtmps://x.example.com/live', 'stream_key' => 'abcdefgh'])->assertForbidden();
        $this->deleteJson('/api/destinations/facebook')->assertForbidden();

        // They can see the saved destination (never the key), to stream with it.
        $list = $this->getJson('/api/destinations')->assertOk()->assertJsonPath('data.0.platform', 'facebook');
        $this->assertStringNotContainsString('FB-SECRET-KEY-123456', $list->getContent());
    }

    public function test_a_smaller_plan_pauses_the_newest_member_who_is_then_signed_out(): void
    {
        $owner = User::factory()->create();
        $this->onPlan($owner, 'team');
        $this->add($owner, 'first@example.com')->assertCreated();
        $this->add($owner, 'second@example.com')->assertCreated();
        $second = User::query()->where('email', 'second@example.com')->firstOrFail();

        $this->onPlan($owner, 'duo');
        $this->actingAs($owner)->getJson('/api/subscription')->assertOk()->assertJsonPath('data.plan.code', 'duo');

        $this->assertNull(User::query()->where('email', 'first@example.com')->value('deactivated_at'));
        $this->assertNotNull($second->fresh()->deactivated_at);

        // Already signed in: the next request signs them out.
        $this->flushSession();
        $this->actingAs($second->fresh())->getJson('/api/setups')->assertForbidden()->assertJsonPath('message', fn ($m) => str_contains($m, 'paused'));
    }

    public function test_a_paused_member_cannot_sign_in_and_comes_back_when_a_seat_frees(): void
    {
        $owner = User::factory()->create();
        $this->onPlan($owner, 'team');
        $this->add($owner, 'first@example.com')->assertCreated();
        $this->add($owner, 'second@example.com')->assertCreated();
        $this->onPlan($owner, 'duo');
        $first = User::query()->where('email', 'first@example.com')->firstOrFail();

        $this->flushSession();
        $this->postJson('/api/auth/login', ['email' => 'second@example.com', 'password' => 'helper-pass-1'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', fn ($m) => str_contains($m, 'paused'));
        $this->assertNotSame('second@example.com', auth()->guard('web')->user()?->email, 'the paused member is not signed in');

        $this->flushSession(); // back on the owner's own browser
        $this->actingAs($owner)->deleteJson("/api/team/{$first->id}")->assertNoContent();
        $this->assertNull(User::query()->where('email', 'second@example.com')->value('deactivated_at'));
    }

    public function test_owners_only_manage_their_own_members(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $theirs = User::factory()->create();
        $theirs->forceFill(['owner_id' => $other->id])->save();

        $this->actingAs($owner)->deleteJson("/api/team/{$theirs->id}")->assertNotFound();
        $this->assertDatabaseHas('users', ['id' => $theirs->id]);
    }

    public function test_sub_users_never_see_other_accounts(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $strangerSetup = app(SetupWriter::class)->createBlank($stranger);
        $member = User::factory()->create();
        $member->forceFill(['owner_id' => $owner->id])->save();

        $this->actingAs($member)->getJson("/api/setups/{$strangerSetup->id}")->assertNotFound();
    }
}
