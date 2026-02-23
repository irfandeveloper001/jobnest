<?php

namespace Database\Seeders;

use App\Models\JobSource;
use Illuminate\Database\Seeder;

class JobSourceSeeder extends Seeder
{
    public function run(): void
    {
        JobSource::updateOrCreate(
            ['key' => 'arbeitnow'],
            [
                'name' => 'Arbeitnow',
                'base_url' => 'https://www.arbeitnow.com/api/job-board-api',
                'enabled' => true,
                'sync_interval_minutes' => 15,
            ]
        );

        JobSource::updateOrCreate(
            ['key' => 'remotive'],
            [
                'name' => 'Remotive',
                'base_url' => 'https://remotive.com/api/remote-jobs',
                'enabled' => true,
                'sync_interval_minutes' => 15,
            ]
        );
    }
}
