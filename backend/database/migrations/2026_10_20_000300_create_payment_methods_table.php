<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The ways to pay that the superadmin manages: GCash, Maya or bank accounts. The seller picks
 * one before sending a receipt, and each payment keeps which one it was (and a copy of its
 * details, in case the method is edited or deleted later).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_methods', function (Blueprint $table) {
            $table->id();
            $table->string('type', 10); // gcash | maya | bank
            // The bank's name for a bank; optional for GCash / Maya.
            $table->string('label', 60)->nullable();
            $table->string('account_name', 80);
            $table->string('account_number', 34);
            $table->text('instructions')->nullable();
            $table->boolean('enabled')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('payment_method_id')->nullable()->after('method')->constrained()->nullOnDelete();
            $table->string('method_label', 160)->nullable()->after('payment_method_id');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payment_method_id');
            $table->dropColumn('method_label');
        });
        Schema::dropIfExists('payment_methods');
    }
};
