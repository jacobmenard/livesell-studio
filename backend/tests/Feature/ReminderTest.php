<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\PlanEndingSoon;
use App\Notifications\TrialEndingSoon;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ReminderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-03-10 09:00:00'));
    }

    private function onPlan(string $code, ?Carbon $endsAt): User
    {
        $owner = User::factory()->create();
        app(Subscriptions::class)->apply($owner, Plan::query()->where('code', $code)->firstOrFail(), $endsAt);

        return $owner;
    }

    private function remind(): void
    {
        $this->artisan('plans:send-reminders')->assertSuccessful();
    }

    public function test_a_paid_plan_is_reminded_once_a_few_days_before_it_ends_and_again_after_a_renewal(): void
    {
        $owner = $this->onPlan('solo', now()->addDays(10));

        // Too early.
        $this->remind();
        Notification::assertNothingSent();

        // Three days before: one reminder, even if the job runs again.
        $this->travel(7)->days();
        $this->remind();
        $this->remind();
        Notification::assertSentToTimes($owner, PlanEndingSoon::class, 1);
        Notification::assertSentTo($owner, PlanEndingSoon::class, function (PlanEndingSoon $n) use ($owner): bool {
            $mail = $n->toMail($owner);

            return $mail->subject === 'Your Solo plan ends on Mar 20, 2026' && str_contains(implode(' ', $mail->introLines), 'PHP 299');
        });

        // Renewed: the next month gets its own reminder.
        app(Subscriptions::class)->apply($owner, Plan::query()->where('code', 'solo')->firstOrFail(), now()->addDays(33));
        $this->travel(31)->days();
        $this->remind();
        Notification::assertSentToTimes($owner, PlanEndingSoon::class, 2);
    }

    public function test_no_plan_reminder_while_a_payment_is_being_checked_or_for_plans_without_an_end(): void
    {
        $paying = $this->onPlan('solo', now()->addDays(2));
        Payment::query()->forceCreate([
            'user_id' => $paying->id, 'plan_id' => Plan::query()->where('code', 'solo')->value('id'),
            'amount' => 299, 'currency' => 'PHP', 'method' => 'gcash', 'reference_number' => 'REF300001', 'proof_path' => 'x.png',
        ]);
        $noEnd = $this->onPlan('team', null);
        $ended = $this->onPlan('duo', now()->addDay());
        $this->travel(2)->days();

        $this->remind();

        Notification::assertNotSentTo($paying, PlanEndingSoon::class);
        Notification::assertNotSentTo($noEnd, PlanEndingSoon::class);
        Notification::assertNotSentTo($ended, PlanEndingSoon::class); // already over
    }

    public function test_the_free_trial_is_reminded_once_before_it_ends(): void
    {
        $owner = User::factory()->create();
        $owner->forceFill(['trial_ends_at' => now()->addDays(7)])->save();
        $member = User::factory()->create();
        $member->forceFill(['owner_id' => $owner->id, 'trial_ends_at' => now()->addDay()])->save();

        $this->remind();
        Notification::assertNothingSent();

        $this->travel(5)->days();
        $this->remind();
        $this->remind();
        Notification::assertSentToTimes($owner, TrialEndingSoon::class, 1);
        Notification::assertNotSentTo($member, TrialEndingSoon::class); // only account owners
        $this->assertNotNull($owner->fresh()->trial_reminded_at);
    }

    public function test_a_trial_that_became_a_paid_plan_is_not_reminded(): void
    {
        $owner = User::factory()->create();
        $owner->forceFill(['trial_ends_at' => now()->addDay()])->save();
        app(Subscriptions::class)->apply($owner, Plan::query()->where('code', 'duo')->firstOrFail(), now()->addMonth());

        $this->remind();

        Notification::assertNothingSent();
    }

    public function test_reminders_run_hourly_during_the_day(): void
    {
        $this->artisan('schedule:list')->expectsOutputToContain('plans:send-reminders')->assertSuccessful();
    }
}
