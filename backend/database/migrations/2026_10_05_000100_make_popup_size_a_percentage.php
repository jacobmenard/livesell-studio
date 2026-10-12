<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Popup size goes from a fixed choice (S / M / L) to a free percentage of the old
 * "Medium". Existing popups keep their look. The map is written out here (not read
 * from Catalog) so this migration means the same thing forever.
 */
return new class extends Migration
{
    private const LETTER_TO_PERCENT = ['S' => 65, 'M' => 100, 'L' => 158];

    public function up(): void
    {
        Schema::table('setup_popups', function (Blueprint $table) {
            $table->unsignedSmallInteger('size_percent')->default(100)->after('size');
        });

        foreach (self::LETTER_TO_PERCENT as $letter => $percent) {
            DB::table('setup_popups')->where('size', $letter)->update(['size_percent' => $percent]);
        }

        Schema::table('setup_popups', function (Blueprint $table) {
            $table->dropColumn('size');
        });
        Schema::table('setup_popups', function (Blueprint $table) {
            $table->renameColumn('size_percent', 'size');
        });
    }

    public function down(): void
    {
        Schema::table('setup_popups', function (Blueprint $table) {
            $table->char('size_letter', 1)->default('M')->after('size');
        });

        // Back to the nearest of the three old choices.
        DB::table('setup_popups')->where('size', '<', 80)->update(['size_letter' => 'S']);
        DB::table('setup_popups')->where('size', '>=', 130)->update(['size_letter' => 'L']);

        Schema::table('setup_popups', function (Blueprint $table) {
            $table->dropColumn('size');
        });
        Schema::table('setup_popups', function (Blueprint $table) {
            $table->renameColumn('size_letter', 'size');
        });
    }
};
