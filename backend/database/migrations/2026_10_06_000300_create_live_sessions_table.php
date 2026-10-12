<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // An open clean screen (window or Browser Source link), kept alive by heartbeats.
        // The plan limits how many different setups an account has live at once.
        Schema::create('live_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('account_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('setup_id')->constrained()->cascadeOnDelete();
            $table->foreignId('started_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 10);
            $table->timestamp('last_seen_at')->index();
            $table->timestamps();
            $table->index(['account_id', 'last_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_sessions');
    }
};
