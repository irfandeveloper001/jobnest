<?php

namespace App\Services\JobSources;

use Illuminate\Support\Carbon;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class JSearchClient
{
    public function search(array $options = []): array
    {
        $key = (string) config('services.rapidapi.key', '');
        $host = (string) config('services.rapidapi.host', 'jsearch.p.rapidapi.com');
        $baseUrl = rtrim((string) config('services.rapidapi.base_url', 'https://jsearch.p.rapidapi.com'), '/');

        if ($key === '') {
            throw new RuntimeException('RapidAPI key missing');
        }

        $query = trim((string) ($options['query'] ?? ''));
        if ($query === '') {
            $query = 'software developer';
        }

        $page = max(1, (int) ($options['page'] ?? 1));
        $numPages = max(1, (int) ($options['num_pages'] ?? 1));
        $country = strtolower(trim((string) ($options['country'] ?? 'pk')));

        $params = [
            'query' => $query,
            'page' => $page,
            'num_pages' => $numPages,
            'country' => $country,
        ];

        if (! empty($options['date_posted'])) {
            $params['date_posted'] = (string) $options['date_posted'];
        }

        if (array_key_exists('remote_jobs_only', $options) && $options['remote_jobs_only'] !== null) {
            $remoteValue = filter_var($options['remote_jobs_only'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($remoteValue !== null) {
                $params['remote_jobs_only'] = $remoteValue ? 'true' : 'false';
            }
        }

        if (! empty($options['employment_types'])) {
            $params['employment_types'] = (string) $options['employment_types'];
        }

        try {
            $response = Http::acceptJson()
                ->timeout(30)
                ->retry(2, 500)
                ->withHeaders([
                    'X-RapidAPI-Key' => $key,
                    'X-RapidAPI-Host' => $host,
                ])
                ->get("{$baseUrl}/search", $params);

            if (in_array($response->status(), [401, 403], true)) {
                throw new RuntimeException('RapidAPI key invalid');
            }

            if ($response->status() === 429 || Str::contains(Str::lower($response->body()), ['quota', 'rate limit'])) {
                throw new RuntimeException('RapidAPI quota exceeded');
            }

            if (! $response->ok()) {
                Log::error('JSearch API request failed', [
                    'status' => $response->status(),
                    'body' => Str::limit($response->body(), 1000),
                    'params' => $params,
                ]);

                throw new RuntimeException('Unable to fetch JSearch jobs right now');
            }

            $rows = $response->json('data');
            if (! is_array($rows)) {
                return [];
            }

            return collect($rows)
                ->map(function (array $row): ?array {
                    $externalId = (string) ($row['job_id'] ?? '');
                    $title = trim((string) ($row['job_title'] ?? ''));
                    $company = trim((string) ($row['employer_name'] ?? ''));

                    if ($externalId === '') {
                        $seed = implode('|', [
                            $title,
                            $company,
                            (string) ($row['job_apply_link'] ?? ''),
                            (string) ($row['job_google_link'] ?? ''),
                        ]);
                        $externalId = sha1($seed);
                    }

                    if ($title === '') {
                        return null;
                    }

                    $locationParts = array_values(array_filter([
                        trim((string) ($row['job_city'] ?? '')),
                        trim((string) ($row['job_state'] ?? '')),
                        trim((string) ($row['job_country'] ?? '')),
                    ]));
                    $location = implode(', ', $locationParts);
                    if ($location === '') {
                        $location = trim((string) ($row['job_location'] ?? ''));
                    }

                    $description = (string) ($row['job_description'] ?? '');
                    $url = (string) ($row['job_apply_link'] ?? $row['job_google_link'] ?? '');

                    $postedAt = $this->parsePostedAt(
                        $row['job_posted_at_datetime_utc']
                            ?? $row['job_posted_at_timestamp']
                            ?? null
                    );

                    $employment = $row['job_employment_type'] ?? null;
                    $employmentString = is_array($employment)
                        ? implode(',', array_filter(array_map('strval', $employment)))
                        : (string) $employment;

                    $tags = [
                        'publisher' => $row['job_publisher'] ?? null,
                        'employment_types' => $employment,
                        'highlights' => $row['job_highlights'] ?? null,
                        'is_remote' => $row['job_is_remote'] ?? null,
                    ];

                    return [
                        'external_id' => $externalId,
                        'title' => $title,
                        'company' => $company,
                        'company_name' => $company,
                        'location' => $location,
                        'description' => $description,
                        'url' => $url,
                        'posted_at' => $postedAt,
                        'remote_type' => filter_var($row['job_is_remote'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 'remote' : $location,
                        'employment_type' => $employmentString,
                        'source' => 'jsearch',
                        'tags' => $tags,
                        'raw_payload' => $row,
                    ];
                })
                ->filter()
                ->values()
                ->all();
        } catch (RuntimeException $exception) {
            Log::warning('JSearch client runtime exception', [
                'message' => $exception->getMessage(),
                'params' => $params,
            ]);

            throw $exception;
        } catch (RequestException $exception) {
            $status = $exception->response?->status();
            $body = (string) ($exception->response?->body() ?? '');

            if (in_array($status, [401, 403], true)) {
                throw new RuntimeException('RapidAPI key invalid');
            }

            if ($status === 429 || Str::contains(Str::lower($body), ['quota', 'rate limit', 'too many requests'])) {
                throw new RuntimeException('RapidAPI quota exceeded');
            }

            Log::error('JSearch request exception', [
                'status' => $status,
                'body' => Str::limit($body, 1000),
                'params' => $params,
            ]);

            throw new RuntimeException('Unable to fetch JSearch jobs right now');
        } catch (Throwable $exception) {
            Log::error('JSearch client exception', [
                'message' => $exception->getMessage(),
                'params' => $params,
            ]);

            throw new RuntimeException('Unable to fetch JSearch jobs right now');
        }
    }

    private function parsePostedAt(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            if (is_numeric($value)) {
                return Carbon::createFromTimestamp((int) $value)->toDateTimeString();
            }

            return Carbon::parse((string) $value)->toDateTimeString();
        } catch (Throwable) {
            return null;
        }
    }
}
