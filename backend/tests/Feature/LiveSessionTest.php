<?php

namespace Tests\Feature;

use App\Models\OutputLink;
use App\Models\Plan;
use App\Models\Setup;
use App\Models\User;
use App\Services\SetupWriter;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LiveSessionTest extends TestCase
{
    use RefreshDatabase;

    private function setupFor(User $user): Setup
    {
        return app(SetupWriter::class)->createBlank($user);
    }

    private function open(Setup $setup)
    {
        return $this->postJson("/api/setups/{$setup->id}/live-sessions");
    }

    private function onPlan(User $account, string $code): void
    {
        app(Subscriptions::class)->apply($account, Plan::query()->where('code', $code)->firstOrFail(), null);
    }

    public function test_the_free_trial_sets_up_but_cannot_go_live(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $this->actingAs($me);

        $this->getJson("/api/setups/{$setup->id}")->assertOk();
        $this->putJson("/api/setups/{$setup->id}/scene", [
            'orientation' => 'landscape', 'see_through' => false,
            'camera' => ['source' => 'camera', 'device_label' => null, 'mirror' => false, 'brightness' => 50, 'zoom' => 0],
            'background' => ['mode' => 'image', 'preset' => 'rack', 'media_id' => null, 'key_color' => 'green', 'similarity' => 42, 'smoothness' => 18],
            'popups' => [],
        ])->assertOk();

        $this->open($setup)->assertStatus(409)->assertJsonPath('message', fn (string $m) => str_contains($m, 'going live needs a paid plan'));
    }

    public function test_on_free_the_sellers_own_window_is_a_preview_but_obs_links_are_not(): void
    {
        $me = User::factory()->create();
        $setup = $this->setupFor($me);
        $token = OutputLink::generateToken();
        OutputLink::query()->forceCreate(['setup_id' => $setup->id, 'token_hash' => OutputLink::hashToken($token), 'public_id' => 'pub'.$setup->id]);

        $this->actingAs($me)->open($setup)->assertStatus(409)->assertJsonPath('preview', true);
        $this->postJson("/api/output/{$token}/live-sessions")->assertStatus(409)->assertJsonPath('preview', false);
    }

    public function test_solo_can_have_one_setup_live_and_open_it_more_than_once(): void
    {
        $me = User::factory()->create();
        $this->onPlan($me, 'solo');
        [$first, $second] = [$this->setupFor($me), $this->setupFor($me)];
        $this->actingAs($me);

        $this->open($first)->assertCreated()->assertJsonPath('data.heartbeat_seconds', 30);
        $this->open($first)->assertCreated();

        $this->open($second)->assertStatus(409)->assertJsonPath('message', fn (string $m) => str_contains($m, 'Solo plan can have 1 setup live'));
    }

    public function test_duo_can_have_two_setups_live_and_team_four(): void
    {
        $me = User::factory()->create();
        $this->onPlan($me, 'solo');
        $setups = collect(range(1, 5))->map(fn () => $this->setupFor($me));
        $this->actingAs($me);

        $this->onPlan($me, 'duo');
        $this->open($setups[0])->assertCreated();
        $this->open($setups[1])->assertCreated();
        $this->open($setups[2])->assertStatus(409);

        $this->onPlan($me, 'team');
        $this->open($setups[2])->assertCreated();
        $this->open($setups[3])->assertCreated();
        $this->open($setups[4])->assertStatus(409);
    }

    public function test_a_screen_that_stops_reporting_frees_its_slot(): void
    {
        $me = User::factory()->create();
        $this->onPlan($me, 'solo');
        [$first, $second] = [$this->setupFor($me), $this->setupFor($me)];
        $this->actingAs($me);

        $this->open($first)->assertCreated();
        $this->travel(91)->seconds();

        $this->open($second)->assertCreated();
    }

    public function test_heartbeats_keep_a_live_going_and_ending_frees_the_slot(): void
    {
        $me = User::factory()->create();
        $this->onPlan($me, 'solo');
        [$first, $second] = [$this->setupFor($me), $this->setupFor($me)];
        $this->actingAs($me);

        $id = $this->open($first)->json('data.id');
        $this->travel(60)->seconds();
        $this->putJson("/api/live-sessions/{$id}")->assertOk();
        $this->travel(60)->seconds();
        $this->open($second)->assertStatus(409);

        $this->deleteJson("/api/live-sessions/{$id}")->assertNoContent();
        $this->open($second)->assertCreated();
    }

    public function test_a_screen_that_went_quiet_cant_come_back_once_its_slot_is_taken(): void
    {
        $me = User::factory()->create();
        $this->onPlan($me, 'solo');
        [$first, $second] = [$this->setupFor($me), $this->setupFor($me)];
        $this->actingAs($me);

        $id = $this->open($first)->json('data.id');
        $this->travel(91)->seconds();
        $this->open($second)->assertCreated();

        $this->putJson("/api/live-sessions/{$id}")->assertStatus(409);
    }

    public function test_nobody_else_can_keep_alive_or_end_your_session(): void
    {
        $me = User::factory()->create();
        $this->onPlan($me, 'solo');
        $id = $this->actingAs($me)->open($this->setupFor($me))->json('data.id');

        $other = User::factory()->create();
        $this->actingAs($other)->putJson("/api/live-sessions/{$id}")->assertNotFound();
        $this->actingAs($other)->deleteJson("/api/live-sessions/{$id}")->assertNotFound();
        $this->actingAs($other)->open(Setup::query()->where('user_id', $me->id)->firstOrFail())->assertNotFound();
    }

    public function test_obs_links_count_against_the_same_limit(): void
    {
        $me = User::factory()->create();
        $this->onPlan($me, 'solo');
        [$first, $second] = [$this->setupFor($me), $this->setupFor($me)];
        $token = OutputLink::generateToken();
        OutputLink::query()->forceCreate(['setup_id' => $second->id, 'token_hash' => OutputLink::hashToken($token), 'public_id' => 'pub'.$second->id]);

        $this->actingAs($me)->open($first)->assertCreated();
        $this->postJson("/api/output/{$token}/live-sessions")->assertStatus(409);

        $this->onPlan($me, 'duo');
        $id = $this->postJson("/api/output/{$token}/live-sessions")->assertCreated()->json('data.id');
        $this->putJson("/api/output/{$token}/live-sessions/{$id}")->assertOk();
        $this->deleteJson("/api/output/{$token}/live-sessions/{$id}")->assertNoContent();
    }

    public function test_a_sub_users_live_counts_against_the_owners_plan(): void
    {
        $owner = User::factory()->create();
        $this->onPlan($owner, 'duo');
        $member = User::factory()->create();
        $member->forceFill(['owner_id' => $owner->id])->save();
        $setups = collect(range(1, 3))->map(fn () => $this->setupFor($owner));

        $this->actingAs($owner)->open($setups[0])->assertCreated();
        $this->actingAs($member)->open($setups[1])->assertCreated();
        $this->actingAs($member)->open($setups[2])->assertStatus(409);
    }
}
