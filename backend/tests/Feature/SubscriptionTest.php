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

    /** @return array<string, string> */
    private function signUp(string $email = 'new@example.com'): array
    {
        return ['name' => 'New Seller', 'email' => $email, 'password' => 'secret-pass-1', 'password_confirmation' => 'secret-pass-1'];
    }

    public function test_a_new_sign_up_gets_a_free_week_that_can_go_live_then_drops_to_free(): void
    {
        $this->postJson('/api/auth/register', $this->signUp())->assertCreated();

        $this->getJson('/api/subscription')
            ->assertOk()
            ->assertJsonPath('data.plan.code', 'solo')
            ->assertJsonPath('data.plan.max_live_setups', 1)
            ->assertJsonPath('data.trial_ends_at', now()->addDays(7)->toIso8601String())
            ->assertJsonPath('data.ends_at', null)
            ->assertJsonPath('data.next_payment', null);

        $this->travel(7)->days();
        $this->travel(1)->minutes();
        $this->getJson('/api/subscription')
            ->assertJsonPath('data.plan.code', 'trial')
            ->assertJsonPath('data.plan.max_live_setups', 0)
            ->assertJsonPath('data.trial_ends_at', null);
    }

    public function test_the_trial_length_is_configurable_and_zero_turns_it_off(): void
    {
        config(['livesell.trial_days' => 0]);
        $this->postJson('/api/auth/register', $this->signUp())->assertCreated();

        $this->getJson('/api/subscription')->assertJsonPath('data.plan.code', 'trial')->assertJsonPath('data.trial_ends_at', null);
        $this->assertNull(User::query()->where('email', 'new@example.com')->value('trial_ends_at'));
    }

    public function test_sign_up_cannot_set_its_own_trial(): void
    {
        $this->postJson('/api/auth/register', $this->signUp() + ['trial_ends_at' => now()->addYears(5)->toIso8601String()])->assertCreated();

        $trialEndsAt = User::query()->where('email', 'new@example.com')->firstOrFail()->trial_ends_at;
        $this->assertSame(now()->addDays(7)->toIso8601String(), $trialEndsAt?->toIso8601String());
    }

    public function test_putting_a_plan_in_place_ends_the_trial(): void
    {
        $seller = User::factory()->create();
        $seller->forceFill(['trial_ends_at' => now()->addDays(3)])->save();

        app(Subscriptions::class)->apply($seller, Plan::query()->where('code', 'team')->firstOrFail(), null);

        $this->actingAs($seller)->getJson('/api/subscription')
            ->assertJsonPath('data.plan.code', 'team')
            ->assertJsonPath('data.trial_ends_at', null);
        $this->assertNull($seller->fresh()->trial_ends_at);
    }

    public function test_an_account_without_a_trial_is_on_free_and_the_three_plans_can_be_bought(): void
    {
        $me = User::factory()->create();

        $this->actingAs($me)->getJson('/api/subscription')
            ->assertOk()
            ->assertJsonPath('data.plan.code', 'trial')
            ->assertJsonPath('data.trial_ends_at', null)
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

    public function test_a_plan_with_an_end_date_runs_out(): void
    {
        $seller = User::factory()->create();
        app(Subscriptions::class)->apply($seller, Plan::query()->where('code', 'duo')->firstOrFail(), now()->addMonth());

        $this->actingAs($seller)->getJson('/api/subscription')->assertJsonPath('data.plan.code', 'duo');

        $this->travel(32)->days();
        $this->actingAs($seller)->getJson('/api/subscription')->assertJsonPath('data.plan.code', 'trial');
    }

    public function test_plans_cannot_be_set_by_hand_any_more(): void
    {
        $seller = User::factory()->create();

        $this->actingAs($this->admin())->getJson('/api/admin/accounts')->assertNotFound();
        $this->putJson("/api/admin/accounts/{$seller->id}/plan", ['plan' => 'team', 'ends_at' => null])->assertNotFound();
        $this->assertNull($seller->subscription()->first());
    }

    public function test_only_the_superadmin_reaches_the_admin_screens(): void
    {
        $seller = User::factory()->create();
        $plan = Plan::query()->where('code', 'duo')->firstOrFail();

        $this->actingAs($seller)->getJson('/api/admin/plans')->assertForbidden();
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

    public function test_when_a_plan_runs_out_the_hourly_check_pauses_sub_users_beyond_its_seats(): void
    {
        $owner = User::factory()->create();
        app(Subscriptions::class)->apply($owner, Plan::query()->where('code', 'duo')->firstOrFail(), now()->addMonth());
        $member = $this->member($owner);
        $soloOwner = User::factory()->create(); // no team: nothing to do

        // Still paid: the member keeps their seat.
        $this->artisan('plans:fit-seats')->assertSuccessful();
        $this->assertNull($member->fresh()->deactivated_at);

        // The month ran out (nobody changed the plan): Free has no seats.
        $this->travel(32)->days();
        $this->artisan('plans:fit-seats')->expectsOutput('Checked 1 team.')->assertSuccessful();
        $this->assertNotNull($member->fresh()->deactivated_at);
        $this->actingAs($member->fresh())->getJson('/api/auth/me')->assertForbidden();

        // Paying again brings them back.
        $this->flushSession();
        app(Subscriptions::class)->apply($owner, Plan::query()->where('code', 'duo')->firstOrFail(), now()->addMonth());
        $this->assertNull($member->fresh()->deactivated_at);
        $this->assertNull($soloOwner->fresh()->deactivated_at);
    }

    public function test_the_seat_check_runs_every_hour(): void
    {
        $this->artisan('schedule:list')->expectsOutputToContain('plans:fit-seats')->assertSuccessful();
    }
}
