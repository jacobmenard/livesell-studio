<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The app no longer keeps the bank account sellers pay into (the only thing app_settings
 * held), so the table and the details in it go.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('app_settings');
    }

    public function down(): void
    {
        Schema::create('app_settings', function (Blueprint $table) {
            $table->string('key', 60)->primary();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }
};
