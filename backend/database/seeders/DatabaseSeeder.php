<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            TemplateSeeder::class,
            SuperAdminSeeder::class,
        ]);

        // A demo seller for local development only.
        if (app()->environment('local')) {
            $this->call(TestSellerSeeder::class);
        }
    }
}
