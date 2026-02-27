<?php

namespace App\Services\JobSources;

use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Throwable;

class RemotiveClient
{
    public function search(string $keyword = ''): array
    {
        $params = [];
        if (trim($keyword) !== '') {
            $params['search'] = trim($keyword);
        }

        $response = Http::acceptJson()
            ->timeout(20)
            ->retry(2, 200)
            ->get('https://remotive.com/api/remote-jobs', $params);

        if (! $response->ok()) {
            return [];
        }

        $rows = $response->json('jobs');
        if (! is_array($rows)) {
            return [];
        }

        return collect($rows)
            ->map(function (array $item): array {
                $location = trim((string) ($item['candidate_required_location'] ?? ''));
                $jobType = trim((string) ($item['job_type'] ?? ''));
                $category = trim((string) ($item['category'] ?? ''));

                return [
                    'external_id' => (string) ($item['id'] ?? sha1((string) ($item['url'] ?? json_encode($item)))),
                    'title' => trim((string) ($item['title'] ?? '')),
                    'company' => trim((string) ($item['company_name'] ?? '')),
                    'company_name' => trim((string) ($item['company_name'] ?? '')),
                    'location' => $location,
                    'description' => (string) ($item['description'] ?? ''),
                    'url' => (string) ($item['url'] ?? ''),
                    'posted_at' => $this->parseDate($item['publication_date'] ?? null),
                    'source' => 'remotive',
                    'tags' => [
                        'job_type' => $jobType,
                        'category' => $category,
                    ],
                    'remote_type' => $location,
                    'employment_type' => $jobType,
                    'raw_payload' => $item,
                ];
            })
            ->filter(fn (array $item) => $item['external_id'] !== '' && $item['title'] !== '')
            ->values()
            ->all();
    }

    private function parseDate(mixed $value): ?string
    {
        if (! $value) {
            return null;
        }

        try {
            return Carbon::parse($value)->toDateTimeString();
        } catch (Throwable) {
            return null;
        }
    }
}

