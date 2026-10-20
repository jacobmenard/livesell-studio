<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Remembers which "ending soon" emails went out, so each is sent once: for a paid plan, the
 * end date it was about (a renewal moves the end date, so the next month gets its own); for
 * the free trial, when it was sent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->timestamp('reminded_ends_at')->nullable()->after('ends_at');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('trial_reminded_at')->nullable()->after('trial_ends_at');
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn('reminded_ends_at');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('trial_reminded_at');
        });
    }
};
