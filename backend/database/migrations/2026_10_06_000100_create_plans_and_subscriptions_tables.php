<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What each plan allows. Prices and limits are edited by the superadmin, not in code.
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name', 40);
            $table->unsignedInteger('price_monthly');
            $table->char('currency', 3)->default('PHP');
            $table->unsignedTinyInteger('max_subusers');
            $table->unsignedTinyInteger('max_live_setups');
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // The three plans the app ships with (placeholder prices, in whole pesos).
        $now = now();
        DB::table('plans')->insert([
            ['code' => 'solo', 'name' => 'Solo', 'price_monthly' => 499, 'currency' => 'PHP', 'max_subusers' => 0, 'max_live_setups' => 1, 'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'duo', 'name' => 'Duo', 'price_monthly' => 999, 'currency' => 'PHP', 'max_subusers' => 1, 'max_live_setups' => 2, 'sort_order' => 2, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'team', 'name' => 'Team', 'price_monthly' => 1999, 'currency' => 'PHP', 'max_subusers' => 3, 'max_live_setups' => 4, 'sort_order' => 3, 'created_at' => $now, 'updated_at' => $now],
        ]);

        // One per account owner. No row = the default plan (see config livesell.default_plan).
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->timestamp('ends_at')->nullable();
            // An upgrade the seller asked for, waiting for the superadmin to confirm payment.
            $table->foreignId('requested_plan_id')->nullable()->constrained('plans')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('plans');
    }
};
