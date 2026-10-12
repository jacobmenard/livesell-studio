<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Paid plans through Xendit subscriptions, and a free trial for everyone else: the trial
 * sets everything up but can't go live.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            // False for the free trial: it's what unpaid accounts have, not something to buy.
            $table->boolean('purchasable')->default(true)->after('sort_order');
        });

        $now = now();
        DB::table('plans')->insert([
            'code' => 'trial', 'name' => 'Free trial', 'price_monthly' => 0, 'currency' => 'PHP',
            'max_subusers' => 0, 'max_live_setups' => 0, 'sort_order' => 0, 'purchasable' => false,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->string('xendit_customer_id', 64)->nullable()->after('requested_at');
            // The Xendit subscription charging this account every month (null = no auto-renew).
            $table->string('xendit_plan_id', 64)->nullable()->index()->after('xendit_customer_id');
            // A smaller plan the seller picked; it applies with the next monthly charge.
            $table->foreignId('scheduled_plan_id')->nullable()->after('xendit_plan_id')->constrained('plans')->nullOnDelete();
        });

        // Each trip to Xendit's checkout page to start a subscription.
        Schema::create('billing_checkouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->string('reference_id', 64)->unique();
            $table->string('xendit_session_id', 64)->nullable()->unique();
            $table->string('xendit_plan_id', 64)->nullable()->index();
            $table->text('payment_link_url')->nullable();
            $table->string('status', 16)->default('pending');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();
        });

        // Each monthly charge Xendit reports (one row per subscription cycle).
        Schema::create('billing_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->nullable()->constrained('plans')->nullOnDelete();
            $table->string('xendit_plan_id', 64)->index();
            $table->string('xendit_cycle_id', 64)->unique();
            $table->unsignedInteger('cycle_number')->nullable();
            $table->decimal('amount', 12, 2);
            $table->char('currency', 3);
            $table->string('status', 16);
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_payments');
        Schema::dropIfExists('billing_checkouts');
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('scheduled_plan_id');
            $table->dropColumn(['xendit_customer_id', 'xendit_plan_id']);
        });
        DB::table('plans')->where('code', 'trial')->delete();
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('purchasable');
        });
    }
};
