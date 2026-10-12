<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('setups', function (Blueprint $table) {
            $table->id();
            // Null owner + is_template = a starter template everyone can copy.
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->boolean('is_template')->default(false);
            $table->string('name', 60);
            $table->string('description', 120)->nullable();
            $table->string('orientation', 10)->default('landscape');
            $table->string('resolution', 6)->default('1080p');
            $table->json('camera');
            $table->json('background');
            $table->json('sound_settings');
            $table->json('output_settings');
            // What is on screen right now (also the starting screen next time it opens).
            $table->json('scene');
            $table->timestamp('scene_updated_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
            $table->index('is_template');
        });

        Schema::create('setup_popups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('setup_id')->constrained()->cascadeOnDelete();
            $table->string('key', 40);
            $table->string('kind', 10);
            $table->string('preset_key', 16)->nullable();
            $table->string('label', 24);
            $table->string('text', 24)->nullable();
            $table->string('color', 10)->nullable();
            $table->foreignId('media_id')->nullable()->constrained('media')->nullOnDelete();
            $table->char('position', 2);
            $table->char('size', 1)->default('M');
            $table->string('entrance', 8)->default('pop');
            $table->string('effect', 12)->default('none');
            $table->string('effect_repeat', 6)->default('once');
            $table->unsignedTinyInteger('auto_hide')->default(0);
            $table->string('sound', 32)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['setup_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('setup_popups');
        Schema::dropIfExists('setups');
    }
};
