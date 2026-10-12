<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A full-width image docked to the top or bottom of the stage (banner, lower third).
        // Null for setups saved before overlays existed: they read as "off".
        Schema::table('setups', function (Blueprint $table) {
            $table->json('overlay')->nullable()->after('background');
        });
    }

    public function down(): void
    {
        Schema::table('setups', function (Blueprint $table) {
            $table->dropColumn('overlay');
        });
    }
};
