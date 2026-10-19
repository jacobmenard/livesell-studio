<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Plans are paid by GCash bank transfer and checked by the superadmin instead of Xendit.
 * The Xendit tables and columns go (no real payment ever went through them), and so does
 * the old "request a plan" flow: a submitted payment is the request now.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('billing_payments');
        Schema::dropIfExists('billing_checkouts');

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('scheduled_plan_id');
            $table->dropConstrainedForeignId('requested_plan_id');
            // Index first: MySQL drops it with the column, SQLite refuses to drop an indexed column.
            $table->dropIndex(['xendit_plan_id']);
            $table->dropColumn(['xendit_customer_id', 'xendit_plan_id', 'requested_at']);
        });

        // Where sellers send money, edited by the superadmin (bank, account number and name...).
        Schema::create('app_settings', function (Blueprint $table) {
            $table->string('key', 60)->primary();
            $table->text('value')->nullable();
            $table->timestamps();
        });

        // A seller's payment for a plan, waiting for the superadmin to check it.
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete(); // the account owner
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->unsignedInteger('amount');
            $table->char('currency', 3);
            $table->string('method', 20);
            $table->string('reference_number', 40)->index();
            // The receipt screenshot, on the private disk (never a public URL).
            $table->string('proof_path');
            $table->string('status', 10)->default('pending')->index();
            $table->text('review_note')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            // The month this payment bought, set when it's approved.
            $table->timestamp('period_start')->nullable();
            $table->timestamp('period_end')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('app_settings');

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->foreignId('requested_plan_id')->nullable()->constrained('plans')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();
            $table->string('xendit_customer_id', 64)->nullable();
            $table->string('xendit_plan_id', 64)->nullable()->index();
            $table->foreignId('scheduled_plan_id')->nullable()->constrained('plans')->nullOnDelete();
        });

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
};
