<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Superadmin's sales report: approved payments added up by day, week or month. */
class ReportTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        // Wednesday, 29 October 2026, in the app's time zone.
        $this->travelTo(CarbonImmutable::parse('2026-10-29 15:00:00'));
        $this->admin = User::factory()->create();
        $this->admin->forceFill(['role' => UserRole::SuperAdmin])->save();
    }

    /** A payment keeps the amount it was made for, whatever the plan costs now. */
    private function payment(string $plan, int $amount, string $reviewedAt, string $status = Payment::APPROVED, string $currency = 'PHP'): void
    {
        $plan = Plan::query()->where('code', $plan)->firstOrFail();
        $payment = new Payment;
        $payment->forceFill([
            'user_id' => User::factory()->create()->id,
            'plan_id' => $plan->id,
            'amount' => $amount,
            'currency' => $currency,
            'method' => 'gcash',
            'reference_number' => fake()->unique()->numerify('REF######'),
            'proof_path' => 'proofs/x.png',
            'status' => $status,
            'reviewed_at' => $status === Payment::PENDING ? null : $reviewedAt,
        ])->save();
    }

    private function report(array $query = [])
    {
        return $this->actingAs($this->admin)->getJson('/api/admin/reports/sales?'.http_build_query($query));
    }

    public function test_daily_sales_cover_the_last_30_days_with_empty_days_included(): void
    {
        $this->payment('solo', 500, '2026-10-29 09:00:00');
        $this->payment('duo', 1000, '2026-10-29 23:59:00'); // still the 29th here
        $this->payment('team', 2000, '2026-10-28 00:05:00');
        $this->payment('solo', 500, '2026-09-29 12:00:00'); // before the 30 days
        $this->payment('team', 2000, '2026-10-27 10:00:00', Payment::REJECTED);
        $this->payment('team', 2000, '2026-10-27 10:00:00', Payment::PENDING);

        $this->report()
            ->assertOk()
            ->assertJsonPath('data.period', 'daily')
            ->assertJsonPath('data.from', '2026-09-30')
            ->assertJsonPath('data.to', '2026-10-29')
            ->assertJsonPath('data.currency', 'PHP')
            ->assertJsonCount(30, 'data.rows')
            ->assertJsonPath('data.rows.29', ['start' => '2026-10-29', 'end' => '2026-10-29', 'total' => 1500, 'count' => 2])
            ->assertJsonPath('data.rows.28.total', 2000)
            ->assertJsonPath('data.rows.27.total', 0)
            ->assertJsonPath('data.total', 3500)
            ->assertJsonPath('data.count', 3)
            ->assertJsonPath('data.by_plan.*.name', ['Team', 'Duo', 'Solo'])
            ->assertJsonPath('data.by_plan.*.total', [2000, 1000, 500])
            ->assertJsonPath('data.by_plan.*.count', [1, 1, 1]);
    }

    public function test_weekly_and_monthly_sales_snap_to_whole_weeks_and_months(): void
    {
        $this->payment('solo', 500, '2026-10-26 08:00:00'); // Monday of this week
        $this->payment('solo', 500, '2026-10-25 20:00:00'); // Sunday of last week
        $this->payment('duo', 1000, '2026-09-30 12:00:00');

        $this->report(['period' => 'weekly', 'from' => '2026-10-21', 'to' => '2026-10-29'])
            ->assertOk()
            ->assertJsonPath('data.from', '2026-10-19')
            ->assertJsonPath('data.to', '2026-11-01')
            ->assertJsonPath('data.rows', [
                ['start' => '2026-10-19', 'end' => '2026-10-25', 'total' => 500, 'count' => 1],
                ['start' => '2026-10-26', 'end' => '2026-11-01', 'total' => 500, 'count' => 1],
            ]);

        $this->report(['period' => 'monthly'])
            ->assertOk()
            ->assertJsonPath('data.from', '2025-11-01')
            ->assertJsonPath('data.to', '2026-10-31')
            ->assertJsonCount(12, 'data.rows')
            ->assertJsonPath('data.rows.10', ['start' => '2026-09-01', 'end' => '2026-09-30', 'total' => 1000, 'count' => 1])
            ->assertJsonPath('data.rows.11.total', 1000);
    }

    public function test_only_the_plan_currency_is_added_up(): void
    {
        $this->payment('solo', 500, '2026-10-29 09:00:00');
        $this->payment('solo', 10, '2026-10-29 09:00:00', Payment::APPROVED, 'USD');

        $this->report()->assertJsonPath('data.total', 500)->assertJsonPath('data.count', 1);
    }

    public function test_bad_ranges_are_refused(): void
    {
        $this->report(['period' => 'yearly'])->assertUnprocessable()->assertJsonValidationErrors('period');
        $this->report(['from' => '29/10/2026'])->assertUnprocessable()->assertJsonValidationErrors('from');
        $this->report(['from' => '2026-10-29', 'to' => '2026-10-01'])->assertUnprocessable()->assertJsonValidationErrors('from');
        $this->report(['from' => '2025-01-01', 'to' => '2026-10-29'])->assertUnprocessable()->assertJsonValidationErrors('from');
        $this->report(['period' => 'monthly', 'from' => '2025-01-01', 'to' => '2026-10-29'])->assertOk()->assertJsonCount(22, 'data.rows');
    }

    public function test_only_the_superadmin_sees_sales(): void
    {
        $this->actingAs(User::factory()->create())->getJson('/api/admin/reports/sales')->assertForbidden();
    }
}
