<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The docked overlay image becomes the "foreground", with its own uploads (media kind
 * "foreground") kept apart from popup images. Settings carry over by renaming the column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('setups', function (Blueprint $table) {
            $table->renameColumn('overlay', 'foreground');
        });
    }

    public function down(): void
    {
        Schema::table('setups', function (Blueprint $table) {
            $table->renameColumn('foreground', 'overlay');
        });
    }
};
