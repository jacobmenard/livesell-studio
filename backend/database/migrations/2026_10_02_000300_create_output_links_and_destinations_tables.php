<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Private clean-screen links for OBS / TikTok LIVE Studio Browser Sources.
        // Only a SHA-256 hash of the token is stored; the token is shown once.
        Schema::create('output_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('setup_id')->constrained()->cascadeOnDelete();
            $table->string('public_id', 26)->unique();
            $table->char('token_hash', 64)->unique();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['setup_id', 'revoked_at']);
        });

        // RTMP destinations. The stream key is encrypted at rest and never returned in full.
        Schema::create('stream_destinations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('platform', 16);
            $table->string('server_url', 300);
            $table->text('stream_key');
            $table->timestamps();

            $table->unique(['user_id', 'platform']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stream_destinations');
        Schema::dropIfExists('output_links');
    }
};
