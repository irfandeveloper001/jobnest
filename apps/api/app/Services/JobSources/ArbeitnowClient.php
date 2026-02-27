<?php

namespace App\Services\JobSources;

use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Throwable;

class ArbeitnowClient
{
    public function search(string $keyword = ''): array
    {
        $response = Http::acceptJson()
            ->timeout(20)
            ->retry(2, 200)
            ->get('https://www.arbeitnow.com/api/job-board-api');

        if (! $response->ok()) {
            return [];
        }

        $rows = $response->json('data');
        if (! is_array($rows)) {
            return [];
        }

        $records = collect($rows)
            ->map(function (array $item): array {
                $location = trim((string) ($item['location'] ?? ''));
                $jobTypes = is_array($item['job_types'] ?? null)
                    ? array_values(array_filter(array_map('strval', $item['job_types'])))
                    : [];
                $tags = is_array($item['tags'] ?? null)
                    ? array_values(array_filter(array_map('strval', $item['tags'])))
                    : [];
                $remote = (bool) ($item['remote'] ?? false);

                return [
                    'external_id' => (string) ($item['slug'] ?? $item['id'] ?? sha1((string) ($item['url'] ?? json_encode($item)))),
                    'title' => trim((string) ($item['title'] ?? '')),
                    'company' => trim((string) ($item['company_name'] ?? '')),
                    'company_name' => trim((string) ($item['company_name'] ?? '')),
                    'location' => $location,
                    'description' => (string) ($item['description'] ?? ''),
                    'url' => (string) ($item['url'] ?? ''),
                    'posted_at' => $this->parseDate($item['created_at'] ?? null),
                    'source' => 'arbeitnow',
                    'tags' => [
                        'job_types' => $jobTypes,
                        'tags' => $tags,
                        'remote' => $remote,
                    ],
                    'remote_type' => $remote ? 'remote' : $location,
                    'employment_type' => implode(' ', $jobTypes),
                    'raw_payload' => $item,
                ];
            })
            ->filter(fn (array $item) => $item['external_id'] !== '' && $item['title'] !== '')
            ->values()
            ->all();

        return $this->filterByKeyword($records, $keyword);
    }

    private function filterByKeyword(array $rows, string $keyword): array
    {
        $needle = strtolower(trim($keyword));
        if ($needle === '') {
            return $rows;
        }

        return array_values(array_filter($rows, function (array $row) use ($needle): bool {
            $haystack = strtolower(implode(' ', [
                $row['title'] ?? '',
                $row['company_name'] ?? '',
                $row['location'] ?? '',
                $row['description'] ?? '',
            ]));

            return str_contains($haystack, $needle);
        }));
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

