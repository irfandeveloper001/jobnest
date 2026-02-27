<?php

namespace Database\Seeders;

use App\Models\Job;
use App\Models\JobSource;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class JobDemoSeeder extends Seeder
{
    public function run(): void
    {
        $source = JobSource::query()->updateOrCreate(
            ['key' => 'demo'],
            [
                'name' => 'Demo Jobs',
                'base_url' => 'local://demo-jobs',
                'enabled' => true,
                'sync_interval_minutes' => 1440,
            ]
        );

        $titles = [
            'Frontend Developer',
            'React Engineer',
            'Laravel Backend Developer',
            'Full Stack JavaScript Engineer',
            'QA Automation Engineer',
            'DevOps Engineer',
            'Product Designer',
            'UI Engineer',
            'Mobile App Developer',
            'Data Analyst',
        ];

        $companies = [
            'NexaSoft',
            'PakTech Labs',
            'CloudNova',
            'Greenbyte Systems',
            'Vertex Digital',
            'ByteBridge',
            'CodePeak',
            'InnovaStack',
            'Orbit Solutions',
            'StackForge',
        ];

        $locations = [
            'Lahore, Punjab, Pakistan',
            'Karachi, Sindh, Pakistan',
            'Islamabad, Islamabad Capital Territory, Pakistan',
            'Remote, Pakistan',
        ];

        for ($i = 1; $i <= 30; $i++) {
            $title = $titles[array_rand($titles)];
            $company = $companies[array_rand($companies)];
            $location = $locations[array_rand($locations)];
            $isRemote = str_contains(strtolower($location), 'remote');

            $job = Job::query()->updateOrCreate(
                [
                    'source_id' => $source->id,
                    'external_id' => 'demo-'.$i,
                ],
                [
                    'title' => $title,
                    'company_name' => $company,
                    'location' => $location,
                    'remote_type' => $isRemote ? 'remote' : (rand(0, 1) ? 'onsite' : 'hybrid'),
                    'employment_type' => rand(0, 4) === 0 ? 'contract' : 'full_time',
                    'status' => 'new',
                    'url' => 'https://example.com/jobs/demo-'.$i,
                    'description' => "Demo seed job for {$title} at {$company}.",
                    'tags' => [
                        'seed' => true,
                        'role_family' => str_contains(strtolower($title), 'designer') ? 'design' : 'engineering',
                    ],
                    'posted_at' => now()->subDays(rand(0, 13))->subHours(rand(0, 23)),
                    'raw_payload' => [
                        'seed' => true,
                        'seed_no' => $i,
                        'source' => 'demo',
                    ],
                ]
            );

            if (Schema::hasTable('job_user')) {
                $users = User::query()->pluck('id');
                foreach ($users as $userId) {
                    DB::table('job_user')->updateOrInsert(
                        [
                            'user_id' => $userId,
                            'job_id' => $job->id,
                        ],
                        [
                            'saved' => false,
                            'hidden' => false,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]
                    );
                }
            }
        }
    }
}
