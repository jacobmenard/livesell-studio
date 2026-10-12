<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Launch pricing: Free ₱0 · Solo ₱299 · Duo ₱599 · Team ₱999 (limits unchanged). Prices stay
 * editable in Admin. Existing Xendit subscriptions keep charging what they started with.
 */
return new class extends Migration
{
    private const LAUNCH = [
        'trial' => ['name' => 'Free', 'price_monthly' => 0],
        'solo' => ['name' => 'Solo', 'price_monthly' => 299],
        'duo' => ['name' => 'Duo', 'price_monthly' => 599],
        'team' => ['name' => 'Team', 'price_monthly' => 999],
    ];

    private const BEFORE = [
        'trial' => ['name' => 'Free trial', 'price_monthly' => 0],
        'solo' => ['name' => 'Solo', 'price_monthly' => 499],
        'duo' => ['name' => 'Duo', 'price_monthly' => 999],
        'team' => ['name' => 'Team', 'price_monthly' => 1999],
    ];

    public function up(): void
    {
        $this->apply(self::LAUNCH);
    }

    public function down(): void
    {
        $this->apply(self::BEFORE);
    }

    /** @param array<string, array{name: string, price_monthly: int}> $plans */
    private function apply(array $plans): void
    {
        foreach ($plans as $code => $values) {
            DB::table('plans')->where('code', $code)->update($values + ['updated_at' => now()]);
        }
    }
};
