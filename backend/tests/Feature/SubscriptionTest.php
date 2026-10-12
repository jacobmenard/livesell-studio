<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Plan;
use App\Models\User;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->forceFill(['role' => UserRole::SuperAdmin])->save();

        return $admin;
    }

    private function member(User $owner): User
    {
        $member = User::factory()->create();
        $member->forceFill(['owner_id' => $owner->id])->save();

        return $member;
    }

    public function test_every_account_starts_on_the_free_trial_and_the_three_plans_can_be_bought(): void
    {
        $me = User::factory()->create();

        $this->actingAs($me)->getJson('/api/subscription')
            ->assertOk()
            ->assertJsonPath('data.plan.code', 'trial')
            ->assertJsonPath('data.plan.max_live_setups', 0)
            ->assertJsonPath('data.usage', ['subusers' => 0, 'live_setups' => 0])
            ->assertJsonPath('data.plans.*.code', ['trial', 'solo', 'duo', 'team'])
            ->assertJsonPath('data.plans.*.purchasable', [false, true, true, true])
            ->assertJsonPath('data.plans.2.max_subusers', 1)
            ->assertJsonPath('data.plans.2.max_live_setups', 2)
            ->assertJsonPath('data.plans.3.max_subusers', 3)
            ->assertJsonPath('data.plans.3.max_live_setups', 4)
            ->assertJsonPath('data.pending_payment', null)
            ->assertJsonPath('data.next_payment', null)
            ->assertJsonPath('data.payments', []);
    }

    public function test_launch_pricing_is_public_for_the_pricing_page(): void
    {
        $this->getJson('/api/plans')
            ->assertOk()
            ->assertJsonPath('data.*.code', ['trial', 'solo', 'duo', 'team'])
            ->assertJsonPath('data.*.name', ['Free', 'Solo', 'Duo', 'Team'])
            ->assertJsonPath('data.*.price_monthly', [0, 299, 599, 999])
            ->assertJsonPath('data.*.max_live_setups', [0, 1, 2, 4])
            ->assertJsonPath('data.*.max_subusers', [0, 0, 1, 3]);
    }

    public function test_the_superadmin_sets_a_plan_by_hand_and_a_plan_with_an_end_date_runs_out(): void
    {
        $seller = User::factory()->create();

        $endsAt = now()->addMonth()->toDateString();
        $this->actingAs($this->admin())->putJson("/api/admin/accounts/{$seller->id}/plan", ['plan' => 'duo', 'ends_at' => $endsAt])
            ->assertOk()
            ->assertJsonPath('data.plan.code', 'duo');

        $this->flushSession();
        $this->actingAs($seller)->getJson('/api/subscription')->assertJsonPath('data.plan.code', 'duo');

        $this->travel(32)->days();
        $this->actingAs($seller)->getJson('/api/subscription')->assertJsonPath('data.plan.code', 'trial');
    }

    public function test_only_the_superadmin_reaches_the_admin_screens(): void
    {
        $seller = User::factory()->create();
        $plan = Plan::query()->where('code', 'duo')->firstOrFail();

        $this->actingAs($seller)->getJson('/api/admin/accounts')->assertForbidden();
        $this->actingAs($seller)->putJson("/api/admin/accounts/{$seller->id}/plan", ['plan' => 'team'])->assertForbidden();
        $this->actingAs($seller)->putJson("/api/admin/plans/{$plan->id}", ['name' => 'Free', 'price_monthly' => 0, 'max_subusers' => 9, 'max_live_setups' => 9])->assertForbidden();
    }

    public function test_the_superadmin_edits_a_plan_and_teams_are_fitted_to_fewer_seats(): void
    {
        $owner = User::factory()->create();
        app(Subscriptions::class)->apply($owner, Plan::query()->where('code', 'team')->firstOrFail(), null);
        $members = collect(range(1, 3))->map(fn () => $this->member($owner));

        $team = Plan::query()->where('code', 'team')->firstOrFail();
        $this->actingAs($this->admin())->putJson("/api/admin/plans/{$team->id}", ['name' => 'Team', 'price_monthly' => 2499, 'max_subusers' => 2, 'max_live_setups' => 5])
            ->assertOk()
            ->assertJsonPath('data.price_monthly', 2499)
            ->assertJsonPath('data.max_live_setups', 5);

        // The newest member is paused, the others keep their seat.
        $this->assertNull($members[0]->fresh()->deactivated_at);
        $this->assertNull($members[1]->fresh()->deactivated_at);
        $this->assertNotNull($members[2]->fresh()->deactivated_at);
    }

    public function test_a_sub_user_sees_the_plan_but_cannot_change_it(): void
    {
        $owner = User::factory()->create();
        $member = $this->member($owner);

        $this->actingAs($member)->getJson('/api/subscription')->assertOk()->assertJsonPath('data.plan.code', 'trial');
        $this->actingAs($member)->post('/api/payments', ['plan' => 'team'], ['Accept' => 'application/json'])->assertForbidden();
    }
}
