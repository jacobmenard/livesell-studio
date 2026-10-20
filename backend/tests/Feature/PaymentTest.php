<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\PaymentReviewed;
use App\Notifications\PaymentSubmitted;
use App\Services\Subscriptions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Storage::fake(Payment::PROOF_DISK);
        $this->travelTo(Carbon::parse('2026-03-10 09:00:00'));
    }

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->forceFill(['role' => UserRole::SuperAdmin])->save();

        return $admin;
    }

    /** @param array<string, mixed> $overrides */
    private function pay(User $as, string $plan, string $reference, array $overrides = []): TestResponse
    {
        $this->flushSession();

        return $this->actingAs($as)->post('/api/payments', array_merge([
            'plan' => $plan,
            'reference_number' => $reference,
            'proof' => UploadedFile::fake()->image('receipt.png', 400, 800),
        ], $overrides), ['Accept' => 'application/json']);
    }

    private function approve(int $paymentId): TestResponse
    {
        $this->flushSession();

        return $this->actingAs($this->admin())->postJson("/api/admin/payments/{$paymentId}/approve");
    }

    public function test_a_seller_sends_a_payment_which_waits_for_the_superadmin(): void
    {
        $admin = $this->admin();
        $seller = User::factory()->create();

        $id = $this->pay($seller, 'solo', '1012 345 678 901', ['amount' => 1])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.amount', 299) // the plan's price, not what was sent
            ->assertJsonPath('data.reference_number', '1012345678901')
            ->assertJsonPath('data.plan.code', 'solo')
            ->json('data.id');

        $payment = Payment::query()->findOrFail($id);
        Storage::disk(Payment::PROOF_DISK)->assertExists($payment->proof_path);
        $this->assertStringStartsWith("payment-proofs/{$seller->id}/", $payment->proof_path);
        Notification::assertSentTo($admin, PaymentSubmitted::class);
        Notification::assertNotSentTo($seller, PaymentSubmitted::class);

        // Still on Free until it's approved, with the payment shown as being checked.
        $this->getJson('/api/subscription')
            ->assertJsonPath('data.plan.code', 'trial')
            ->assertJsonPath('data.pending_payment.id', $id)
            ->assertJsonPath('data.payments.0.status', 'pending');

        // One payment at a time.
        $this->pay($seller, 'duo', 'ABC123456')->assertUnprocessable()->assertJsonValidationErrors('plan');

        $this->flushSession();
        $this->actingAs($admin)->getJson('/api/admin/payments/pending-count')->assertJsonPath('data.pending', 1);
        $this->getJson('/api/admin/payments')
            ->assertOk()
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.account.email', $seller->email);
    }

    public function test_bad_submissions_are_refused(): void
    {
        $seller = User::factory()->create();

        $this->pay($seller, 'trial', 'REF123456')->assertUnprocessable()->assertJsonValidationErrors('plan');
        $this->pay($seller, 'platinum', 'REF123456')->assertUnprocessable()->assertJsonValidationErrors('plan');
        $this->pay($seller, 'solo', '12-3')->assertUnprocessable()->assertJsonValidationErrors('reference_number');
        $this->pay($seller, 'solo', 'REF#12345!')->assertUnprocessable()->assertJsonValidationErrors('reference_number');
        $this->pay($seller, 'solo', 'REF123456', ['proof' => null])->assertUnprocessable()->assertJsonValidationErrors('proof');
        $this->pay($seller, 'solo', 'REF123456', ['proof' => UploadedFile::fake()->create('receipt.pdf', 10, 'application/pdf')])
            ->assertUnprocessable()->assertJsonValidationErrors('proof');

        $this->assertSame(0, Payment::query()->count());
        $this->assertSame([], Storage::disk(Payment::PROOF_DISK)->allFiles());
    }

    public function test_the_app_keeps_no_bank_details_and_payments_are_always_open(): void
    {
        $seller = User::factory()->create();

        $this->pay($seller, 'solo', 'REF123456')->assertCreated();
        $this->getJson('/api/subscription')->assertJsonMissingPath('data.payment_details');

        $this->flushSession();
        $this->actingAs($this->admin());
        $this->getJson('/api/admin/payment-settings')->assertNotFound();
        $this->assertFalse(Schema::hasTable('app_settings'));
    }

    public function test_paying_during_the_free_trial_starts_the_plan_on_approval_and_ends_the_trial(): void
    {
        $seller = User::factory()->create();
        $seller->forceFill(['trial_ends_at' => now()->addDays(5)])->save();
        $id = $this->pay($seller, 'duo', 'REF110001')->assertCreated()->json('data.id');

        // Until it's approved, the seller keeps the trial.
        $this->getJson('/api/subscription')
            ->assertJsonPath('data.plan.code', 'solo')
            ->assertJsonPath('data.trial_ends_at', now()->addDays(5)->toIso8601String());

        $this->travel(1)->days();
        $this->approve($id)->assertOk()->assertJsonPath('data.period_start', now()->toIso8601String());

        $this->flushSession();
        $this->actingAs($seller)->getJson('/api/subscription')
            ->assertJsonPath('data.plan.code', 'duo')
            ->assertJsonPath('data.trial_ends_at', null)
            ->assertJsonPath('data.ends_at', now()->addMonthNoOverflow()->toIso8601String());
        $this->assertNull($seller->fresh()->trial_ends_at);
    }

    public function test_approving_starts_the_plan_on_the_approval_date_for_a_month(): void
    {
        $seller = User::factory()->create();
        $id = $this->pay($seller, 'solo', 'REF100001')->json('data.id');

        // Approved two days after it was sent: the month counts from the approval.
        $this->travel(2)->days();
        $this->approve($id)
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.period_start', '2026-03-12T09:00:00+00:00')
            ->assertJsonPath('data.period_end', '2026-04-12T09:00:00+00:00');
        Notification::assertSentTo($seller, PaymentReviewed::class);

        // Reviewed once only.
        $this->postJson("/api/admin/payments/{$id}/approve")->assertUnprocessable();

        $this->flushSession();
        $this->actingAs($seller)->getJson('/api/subscription')
            ->assertJsonPath('data.plan.code', 'solo')
            ->assertJsonPath('data.ends_at', '2026-04-12T09:00:00+00:00')
            ->assertJsonPath('data.pending_payment', null)
            ->assertJsonPath('data.next_payment.plan.code', 'solo')
            ->assertJsonPath('data.next_payment.amount', 299)
            ->assertJsonPath('data.next_payment.due_at', '2026-04-12T09:00:00+00:00')
            ->assertJsonPath('data.next_payment.renewable_from', null);
    }

    public function test_renewing_adds_the_next_month_but_only_one_month_ahead(): void
    {
        $seller = User::factory()->create();
        $this->approve($this->pay($seller, 'solo', 'REF200001')->json('data.id'));

        // Renewed early: the new month follows the current one.
        $this->travel(10)->days();
        $this->approve($this->pay($seller, 'solo', 'REF200002')->json('data.id'))
            ->assertJsonPath('data.period_start', '2026-04-10T09:00:00+00:00')
            ->assertJsonPath('data.period_end', '2026-05-10T09:00:00+00:00');

        // Paid through May 10: the next renewal opens on April 10.
        $this->pay($seller, 'solo', 'REF200003')->assertUnprocessable()->assertJsonValidationErrors('plan');
        $this->getJson('/api/subscription')->assertJsonPath('data.next_payment.renewable_from', '2026-04-10T09:00:00+00:00');

        $this->travelTo(Carbon::parse('2026-04-10 09:00:01'));
        $this->pay($seller, 'solo', 'REF200003')->assertCreated();
    }

    public function test_switching_plans_starts_fresh_from_the_approval_date(): void
    {
        $seller = User::factory()->create();
        $this->approve($this->pay($seller, 'solo', 'REF300001')->json('data.id'));

        $this->travel(5)->days();
        $this->approve($this->pay($seller, 'duo', 'REF300002')->json('data.id'))
            ->assertJsonPath('data.period_start', '2026-03-15T09:00:00+00:00')
            ->assertJsonPath('data.period_end', '2026-04-15T09:00:00+00:00');

        $this->flushSession();
        $this->actingAs($seller)->getJson('/api/subscription')->assertJsonPath('data.plan.code', 'duo');
    }

    public function test_a_lapsed_plan_restarts_on_the_approval_date(): void
    {
        $seller = User::factory()->create();
        $this->approve($this->pay($seller, 'solo', 'REF400001')->json('data.id'));

        $this->travelTo(Carbon::parse('2026-05-01 09:00:00'));
        $this->approve($this->pay($seller, 'solo', 'REF400002')->json('data.id'))
            ->assertJsonPath('data.period_start', '2026-05-01T09:00:00+00:00')
            ->assertJsonPath('data.period_end', '2026-06-01T09:00:00+00:00');
    }

    public function test_rejecting_tells_the_seller_why_and_they_can_try_again(): void
    {
        $seller = User::factory()->create();
        $id = $this->pay($seller, 'team', 'REF500001')->json('data.id');

        $this->flushSession();
        $admin = $this->admin();
        $this->actingAs($admin)->postJson("/api/admin/payments/{$id}/reject", [])->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->postJson("/api/admin/payments/{$id}/reject", ['reason' => 'No matching transfer in the bank account.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.review_note', 'No matching transfer in the bank account.');
        Notification::assertSentTo($seller, PaymentReviewed::class);

        $this->flushSession();
        $this->actingAs($seller)->getJson('/api/subscription')
            ->assertJsonPath('data.plan.code', 'trial')
            ->assertJsonPath('data.pending_payment', null)
            ->assertJsonPath('data.payments.0.review_note', 'No matching transfer in the bank account.');

        // A rejected reference can be sent again (e.g. after a typo); an accepted one can't.
        $this->pay($seller, 'team', 'REF500001')->assertCreated();
        $other = User::factory()->create();
        $this->pay($other, 'solo', 'ref-500001')->assertUnprocessable()->assertJsonValidationErrors('reference_number');
    }

    public function test_only_the_owner_and_the_superadmin_see_a_receipt(): void
    {
        $seller = User::factory()->create();
        $id = $this->pay($seller, 'solo', 'REF600001')->json('data.id');
        $member = User::factory()->create();
        $member->forceFill(['owner_id' => $seller->id])->save();

        $this->get("/api/payments/{$id}/proof")->assertOk()->assertHeader('Content-Type', 'image/png');

        $this->flushSession();
        $this->actingAs($this->admin())->get("/api/payments/{$id}/proof")->assertOk();

        $this->flushSession();
        $this->actingAs(User::factory()->create())->getJson("/api/payments/{$id}/proof")->assertNotFound();

        $this->flushSession();
        $this->actingAs($member)->getJson("/api/payments/{$id}/proof")->assertNotFound();
        $this->actingAs($member)->getJson('/api/subscription')->assertOk()->assertJsonPath('data.payments', []);
    }

    public function test_only_the_superadmin_reviews_payments(): void
    {
        $seller = User::factory()->create();
        $id = $this->pay($seller, 'solo', 'REF700001')->json('data.id');

        $this->getJson('/api/admin/payments')->assertForbidden();
        $this->getJson('/api/admin/payments/pending-count')->assertForbidden();
        $this->postJson("/api/admin/payments/{$id}/approve")->assertForbidden();
        $this->postJson("/api/admin/payments/{$id}/reject", ['reason' => 'nope'])->assertForbidden();
    }

    public function test_renewing_a_plan_without_an_end_date_is_refused(): void
    {
        $seller = User::factory()->create();
        app(Subscriptions::class)->apply($seller, Plan::query()->where('code', 'duo')->firstOrFail(), null);

        $this->pay($seller, 'duo', 'REF800001')->assertUnprocessable()->assertJsonValidationErrors('plan');
        $this->pay($seller, 'team', 'REF800001')->assertCreated();
    }
}
