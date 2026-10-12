<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Set for sub-users: the account owner whose setups, uploads and plan they use.
            $table->foreignId('owner_id')->nullable()->after('role')->constrained('users')->cascadeOnDelete();
            // A sub-user paused because the owner's plan has fewer seats; they can't sign in.
            $table->timestamp('deactivated_at')->nullable()->after('owner_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('owner_id');
            $table->dropColumn('deactivated_at');
        });
    }
};
