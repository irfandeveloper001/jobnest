<?php

namespace Database\Seeders;

use App\Models\Job;
use App\Models\JobSource;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class JobDemoSeeder extends Seeder
{
    public function run(): void
    {
        $arbeitnow = JobSource::query()->firstOrCreate(
            ['key' => 'arbeitnow'],
            [
                'name' => 'Arbeitnow',
                'base_url' => 'https://www.arbeitnow.com/api/job-board-api',
                'enabled' => true,
                'sync_interval_minutes' => 15,
            ]
        );

        $remotive = JobSource::query()->firstOrCreate(
            ['key' => 'remotive'],
            [
                'name' => 'Remotive',
                'base_url' => 'https://remotive.com/api/remote-jobs',
                'enabled' => true,
                'sync_interval_minutes' => 15,
            ]
        );

        $jobs = [
            [
                'source_id' => $arbeitnow->id,
                'external_id' => 'demo-arbeitnow-frontend-react',
                'title' => 'Senior Frontend Engineer',
                'company_name' => 'TechFlow Systems',
                'location' => 'Remote / New York',
                'status' => 'new',
                'url' => 'https://example.com/jobs/frontend-engineer',
            ],
            [
                'source_id' => $arbeitnow->id,
                'external_id' => 'demo-arbeitnow-fullstack-laravel',
                'title' => 'Full Stack Developer (Laravel + Remix)',
                'company_name' => 'CloudNest Labs',
                'location' => 'Remote',
                'status' => 'saved',
                'url' => 'https://example.com/jobs/fullstack-laravel-remix',
            ],
            [
                'source_id' => $remotive->id,
                'external_id' => 'demo-remotive-ui-engineer',
                'title' => 'UI Engineer',
                'company_name' => 'PixelBridge',
                'location' => 'Hybrid - Berlin',
                'status' => 'applied',
                'url' => 'https://example.com/jobs/ui-engineer',
            ],
            [
                'source_id' => $remotive->id,
                'external_id' => 'demo-remotive-react-performance',
                'title' => 'React Performance Engineer',
                'company_name' => 'ScaleWorks',
                'location' => 'Remote - Europe',
                'status' => 'new',
                'url' => 'https://example.com/jobs/react-performance',
            ],
            [
                'source_id' => $arbeitnow->id,
                'external_id' => 'demo-arbeitnow-frontend-lead',
                'title' => 'Frontend Lead',
                'company_name' => 'GrowthStack',
                'location' => 'On-site - London',
                'status' => 'ignored',
                'url' => 'https://example.com/jobs/frontend-lead',
            ],
        ];

        foreach ($jobs as $index => $job) {
            Job::query()->updateOrCreate(
                [
                    'source_id' => $job['source_id'],
                    'external_id' => $job['external_id'],
                ],
                [
                    'title' => $job['title'],
                    'company_name' => $job['company_name'],
                    'location' => $job['location'],
                    'remote_type' => 'remote',
                    'employment_type' => 'full_time',
                    'status' => $job['status'],
                    'url' => $job['url'],
                    'description' => 'Demo seeded role for local UI/testing.',
                    'posted_at' => Carbon::now()->subDays($index + 1),
                    'raw_payload' => ['seeded' => true],
                ]
            );
        }
    }
}
