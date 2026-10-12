<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Where a popup was dragged to: its centre as a % of the stage. Null = use the 9-spot `position`.
        Schema::table('setup_popups', function (Blueprint $table) {
            $table->decimal('x', 5, 2)->nullable()->after('position');
            $table->decimal('y', 5, 2)->nullable()->after('x');
        });
    }

    public function down(): void
    {
        Schema::table('setup_popups', function (Blueprint $table) {
            $table->dropColumn(['x', 'y']);
        });
    }
};
