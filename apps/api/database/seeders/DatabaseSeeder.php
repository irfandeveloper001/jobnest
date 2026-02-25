<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            JobSourceSeeder::class,
            AdminUserSeeder::class,
            InboxDemoSeeder::class,
        ]);

        if (env('SEED_LOCATIONS', false)) {
            $this->call([
                LocationsSeeder::class,
            ]);
        }
    }
}
