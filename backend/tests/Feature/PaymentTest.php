<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Plan;
use App\Models\User;
use App\Notifications\PaymentReceived;
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

        $this->gcash = PaymentMethod::query()->create([
            'type' => 'gcash',
            'account_name' => 'Test Business',
            'account_number' => '0917 123 4567',
        ]);
    }

    private PaymentMethod $gcash;

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
            'payment_method' => $this->gcash->id,
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

    public function test_sending_a_payment_emails_the_seller_and_the_business_inbox(): void
    {
        config(['livesell.payments_email' => 'support@negosyoworks.test', 'mail.from.address' => 'no-reply@negosyoworks.test']);
        $admin = $this->admin();
        $seller = User::factory()->create();

        $this->pay($seller, 'solo', 'REF200001')->assertCreated();

        // The seller: their payment arrived and is being checked.
        Notification::assertSentTo($seller, PaymentReceived::class, function (PaymentReceived $n) use ($seller): bool {
            $mail = $n->toMail($seller);
            $text = implode("\n", $mail->introLines);

            return str_contains($mail->subject, 'Solo')
                && str_contains($text, 'PHP 299')
                && str_contains($text, 'REF200001')
                && str_contains($text, 'GCash · 0917 123 4567 · Test Business')
                && $mail->replyTo === [['support@negosyoworks.test', null]];
        });

        // The superadmin account and the business inbox: a payment to check.
        Notification::assertSentTo($admin, PaymentSubmitted::class);
        Notification::assertSentOnDemand(PaymentSubmitted::class, fn ($n, array $channels, object $notifiable): bool => $notifiable->routes['mail'] === 'support@negosyoworks.test');
        Notification::assertNotSentTo($seller, PaymentSubmitted::class);
    }

    public function test_the_business_inbox_gets_one_email_when_a_superadmin_already_uses_it(): void
    {
        config(['livesell.payments_email' => 'Support@negosyoworks.test']);
        $admin = $this->admin();
        $admin->forceFill(['email' => 'support@negosyoworks.test'])->save();

        $this->pay(User::factory()->create(), 'solo', 'REF200002')->assertCreated();

        Notification::assertSentTo($admin, PaymentSubmitted::class);
        Notification::assertSentOnDemandTimes(PaymentSubmitted::class, 0);
    }

    public function test_extra_addresses_get_the_payment_alert_once_each(): void
    {
        config([
            'livesell.payments_email' => 'support@negosyoworks.test',
            // A duplicate (other case), an invalid entry and a superadmin's own address.
            'livesell.payment_alert_emails' => ['owner@gmail.test', 'Owner@Gmail.test', 'not-an-email', 'boss@negosyoworks.test'],
        ]);
        $admin = $this->admin();
        $admin->forceFill(['email' => 'boss@negosyoworks.test'])->save();

        $this->pay(User::factory()->create(), 'solo', 'REF200004')->assertCreated();

        $sentTo = [];
        Notification::assertSentOnDemand(PaymentSubmitted::class, function ($n, array $channels, object $notifiable) use (&$sentTo): bool {
            $sentTo[] = $notifiable->routes['mail'];

            return true;
        });
        sort($sentTo);
        $this->assertSame(['owner@gmail.test', 'support@negosyoworks.test'], array_values(array_unique($sentTo)));
        Notification::assertSentOnDemandTimes(PaymentSubmitted::class, 2);
        Notification::assertSentTo($admin, PaymentSubmitted::class);
    }

    public function test_a_mail_server_failure_does_not_lose_the_payment(): void
    {
        Notification::shouldReceive('send')->andThrow(new \RuntimeException('SMTP down'));
        Notification::shouldReceive('route')->andReturnUsing(fn () => new \Illuminate\Notifications\AnonymousNotifiable);

        $this->pay(User::factory()->create(), 'solo', 'REF200003')->assertCreated();
        $this->assertSame(1, Payment::query()->count());
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

    public function test_the_seller_picks_a_method_and_the_payment_keeps_where_the_money_went(): void
    {
        $maya = PaymentMethod::query()->create(['type' => 'maya', 'account_name' => 'Test Business', 'account_number' => '0918 000 1111', 'sort_order' => 1]);
        PaymentMethod::query()->create(['type' => 'bank', 'label' => 'BDO', 'account_name' => 'Test Business', 'account_number' => '0012 3456', 'enabled' => false]);
        $seller = User::factory()->create();

        // Only the enabled methods are offered, in order.
        $this->actingAs($seller)->getJson('/api/subscription')
            ->assertJsonPath('data.payment_methods.*.name', ['GCash', 'Maya'])
            ->assertJsonPath('data.payment_methods.1.account_number', '0918 000 1111');

        $id = $this->pay($seller, 'solo', 'REF123456', ['payment_method' => $maya->id])
            ->assertCreated()
            ->assertJsonPath('data.method', 'maya')
            ->assertJsonPath('data.method_label', 'Maya · 0918 000 1111 · Test Business')
            ->json('data.id');

        // Deleting the method later keeps the payment's copy of it.
        $this->flushSession();
        $this->actingAs($this->admin())->deleteJson("/api/admin/payment-methods/{$maya->id}")->assertNoContent();
        $this->getJson('/api/admin/payments')
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.method_label', 'Maya · 0918 000 1111 · Test Business');
        $this->assertNull(Payment::query()->findOrFail($id)->payment_method_id);
    }

    public function test_a_method_must_be_chosen_and_turned_on(): void
    {
        $off = PaymentMethod::query()->create(['type' => 'bank', 'label' => 'BDO', 'account_name' => 'Shop', 'account_number' => '0012', 'enabled' => false]);
        $seller = User::factory()->create();

        $this->pay($seller, 'solo', 'REF123456', ['payment_method' => null])->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->pay($seller, 'solo', 'REF123456', ['payment_method' => $off->id])->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->pay($seller, 'solo', 'REF123456', ['payment_method' => 9999])->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->assertSame(0, Payment::query()->count());
    }

    public function test_with_no_method_turned_on_plans_cannot_be_paid_for(): void
    {
        $this->gcash->update(['enabled' => false]);
        $seller = User::factory()->create();

        $this->actingAs($seller)->getJson('/api/subscription')->assertJsonPath('data.payment_methods', []);
        $this->pay($seller, 'solo', 'REF123456')->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->assertFalse(Schema::hasTable('app_settings'));
    }

    public function test_the_superadmin_manages_payment_methods(): void
    {
        $seller = User::factory()->create();
        $this->actingAs($seller)->getJson('/api/admin/payment-methods')->assertForbidden();
        $this->postJson('/api/admin/payment-methods', ['type' => 'gcash', 'account_name' => 'X', 'account_number' => '1'])->assertForbidden();
        $this->putJson("/api/admin/payment-methods/{$this->gcash->id}", ['type' => 'gcash', 'account_name' => 'X', 'account_number' => '1'])->assertForbidden();
        $this->deleteJson("/api/admin/payment-methods/{$this->gcash->id}")->assertForbidden();

        $this->flushSession();
        $this->actingAs($this->admin());
        $this->postJson('/api/admin/payment-methods', ['type' => 'paypal', 'account_name' => 'Shop', 'account_number' => '1'])
            ->assertUnprocessable()->assertJsonValidationErrors('type');
        $this->postJson('/api/admin/payment-methods', ['type' => 'bank', 'account_name' => 'Shop', 'account_number' => '0012'])
            ->assertUnprocessable()->assertJsonValidationErrors('label'); // a bank needs its name
        $this->postJson('/api/admin/payment-methods', ['type' => 'maya', 'account_name' => 'Shop', 'account_number' => 'abc'])
            ->assertUnprocessable()->assertJsonValidationErrors('account_number');

        $id = $this->postJson('/api/admin/payment-methods', ['type' => 'bank', 'label' => ' Metrobank ', 'account_name' => 'Shop', 'account_number' => '142 314 2564', 'instructions' => 'InstaPay is fine.'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Metrobank')
            ->assertJsonPath('data.enabled', true)
            ->json('data.id');

        // Editing without "enabled" leaves it as it was; turning it off hides it from sellers.
        $this->putJson("/api/admin/payment-methods/{$id}", ['type' => 'bank', 'label' => 'Metrobank', 'account_name' => 'Shop Inc', 'account_number' => '142 314 2564'])
            ->assertOk()->assertJsonPath('data.account_name', 'Shop Inc')->assertJsonPath('data.enabled', true)->assertJsonPath('data.instructions', null);
        $this->putJson("/api/admin/payment-methods/{$id}", ['type' => 'bank', 'label' => 'Metrobank', 'account_name' => 'Shop Inc', 'account_number' => '142 314 2564', 'enabled' => false])
            ->assertOk()->assertJsonPath('data.enabled', false);
        $this->getJson('/api/admin/payment-methods')->assertJsonPath('data.*.name', ['GCash', 'Metrobank']);
        $this->getJson('/api/subscription')->assertJsonPath('data.payment_methods.*.name', ['GCash']);
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
