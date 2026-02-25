<?php

namespace App\Jobs;

use App\Models\Job;
use App\Models\JobSource;
use App\Models\SyncLog;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class AutoJobSyncJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 180;

    public function __construct(public int $userId)
    {
    }

    public function handle(): void
    {
        $user = User::query()->find($this->userId);
        if (! $user) {
            return;
        }

        $user->loadMissing([
            'preferredCountry:id,name',
            'preferredState:id,name',
            'preferredCity:id,name',
        ]);

        $keywords = collect($user->preferred_keywords ?? [])
            ->map(fn ($value) => trim((string) $value))
            ->filter()
            ->unique()
            ->values();

        if ($keywords->isEmpty()) {
            $keywords = collect(['']);
        }

        $sources = JobSource::query()
            ->whereIn('key', ['arbeitnow', 'remotive'])
            ->where('enabled', true)
            ->get(['id', 'key']);

        foreach ($sources as $source) {
            $startedAt = now();
            $syncLog = SyncLog::query()->create([
                'source_id' => $source->id,
                'user_id' => $user->id,
                'status' => 'success',
                'started_at' => $startedAt,
                'jobs_fetched' => 0,
                'jobs_created' => 0,
                'jobs_updated' => 0,
            ]);

            try {
                $bucket = [];

                foreach ($keywords as $keyword) {
                    $records = $source->key === 'arbeitnow'
                        ? $this->fetchArbeitnowJobs((string) $keyword, $user)
                        : $this->fetchRemotiveJobs((string) $keyword, $user);

                    foreach ($records as $record) {
                        $composite = ($record['external_id'] ?? '').'|'.$source->id;
                        if ($composite === '|'.$source->id) {
                            continue;
                        }
                        $bucket[$composite] = $record;
                    }
                }

                $jobsFetched = count($bucket);
                $jobsCreated = 0;
                $jobsUpdated = 0;

                foreach ($bucket as $record) {
                    $externalId = (string) ($record['external_id'] ?? '');
                    $title = trim((string) ($record['title'] ?? ''));
                    if ($externalId === '' || $title === '') {
                        continue;
                    }

                    $lookup = [
                        'source_id' => $source->id,
                        'external_id' => $externalId,
                    ];

                    $attributes = [
                        'title' => $title,
                        'company_name' => $record['company_name'] ?? null,
                        'location' => $record['location'] ?? null,
                        'remote_type' => $this->toRemoteType($record['remote_type'] ?? null),
                        'employment_type' => $this->toEmploymentType($record['employment_type'] ?? null),
                        'url' => $record['url'] ?? null,
                        'description' => $record['description'] ?? null,
                        'posted_at' => $record['posted_at'] ?? null,
                        'raw_payload' => $record['raw_payload'] ?? null,
                    ];

                    $job = Job::query()->where($lookup)->first();

                    if (! $job) {
                        $job = Job::query()->create([
                            ...$lookup,
                            ...$attributes,
                            'status' => 'new',
                        ]);
                        $jobsCreated++;
                    } else {
                        $job->fill($attributes);
                        if ($job->isDirty()) {
                            $job->save();
                            $jobsUpdated++;
                        }
                    }

                    if (Schema::hasTable('job_user')) {
                        DB::table('job_user')->updateOrInsert(
                            [
                                'user_id' => $user->id,
                                'job_id' => $job->id,
                            ],
                            [
                                'saved' => false,
                                'hidden' => false,
                                'updated_at' => now(),
                                'created_at' => now(),
                            ]
                        );
                    }
                }

                $syncLog->update([
                    'status' => 'success',
                    'ended_at' => now(),
                    'runtime_ms' => (int) ($startedAt->diffInMilliseconds(now())),
                    'jobs_fetched' => $jobsFetched,
                    'jobs_created' => $jobsCreated,
                    'jobs_updated' => $jobsUpdated,
                ]);

                JobSource::query()
                    ->whereKey($source->id)
                    ->update(['last_synced_at' => now()]);
            } catch (Throwable $exception) {
                $syncLog->update([
                    'status' => 'failed',
                    'ended_at' => now(),
                    'runtime_ms' => (int) ($startedAt->diffInMilliseconds(now())),
                    'error_message' => Str::limit($exception->getMessage(), 1000),
                ]);
            }
        }
    }

    private function fetchArbeitnowJobs(string $keyword, User $user): array
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

        $normalized = collect($rows)->map(function ($item) use ($user): array {
            $jobTypes = is_array($item['job_types'] ?? null) ? implode(' ', $item['job_types']) : '';
            $location = (string) ($item['location'] ?? '');
            $remoteFlag = $item['remote'] ?? null;

            return [
                'external_id' => (string) ($item['slug'] ?? $item['id'] ?? md5((string) ($item['url'] ?? json_encode($item)))),
                'title' => (string) ($item['title'] ?? ''),
                'company_name' => (string) ($item['company_name'] ?? ''),
                'location' => $location,
                'remote_type' => $this->toRemoteType($remoteFlag === true ? 'remote' : $location),
                'employment_type' => $this->toEmploymentType($jobTypes),
                'url' => (string) ($item['url'] ?? ''),
                'description' => (string) ($item['description'] ?? ''),
                'posted_at' => $this->parsePostedAt($item['created_at'] ?? null),
                'raw_payload' => $item,
            ];
        });

        return $this->applyPreferenceFilter($normalized->all(), $keyword, $user);
    }

    private function fetchRemotiveJobs(string $keyword, User $user): array
    {
        $params = [];
        if ($keyword !== '') {
            $params['search'] = $keyword;
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

        $normalized = collect($rows)->map(function ($item): array {
            return [
                'external_id' => (string) ($item['id'] ?? md5((string) ($item['url'] ?? json_encode($item)))),
                'title' => (string) ($item['title'] ?? ''),
                'company_name' => (string) ($item['company_name'] ?? ''),
                'location' => (string) ($item['candidate_required_location'] ?? ''),
                'remote_type' => $this->toRemoteType((string) ($item['candidate_required_location'] ?? 'remote')),
                'employment_type' => $this->toEmploymentType((string) ($item['job_type'] ?? '')),
                'url' => (string) ($item['url'] ?? ''),
                'description' => (string) ($item['description'] ?? ''),
                'posted_at' => $this->parsePostedAt($item['publication_date'] ?? null),
                'raw_payload' => $item,
            ];
        });

        return $this->applyPreferenceFilter($normalized->all(), $keyword, $user);
    }

    private function applyPreferenceFilter(array $rows, string $keyword, User $user): array
    {
        $needle = Str::lower(trim($keyword));
        $preferredLocationValue = $user->preferredCity?->name
            ?? $user->preferredState?->name
            ?? $user->preferredCountry?->name
            ?? $user->preferred_location
            ?? '';
        $preferredLocation = Str::lower(trim((string) $preferredLocationValue));
        $preferredType = Str::lower(trim((string) ($user->preferred_job_type ?? 'any')));

        return array_values(array_filter($rows, function (array $row) use ($needle, $preferredLocation, $preferredType): bool {
            $haystack = Str::lower(implode(' ', [
                $row['title'] ?? '',
                $row['company_name'] ?? '',
                $row['location'] ?? '',
                $row['description'] ?? '',
            ]));

            $keywordMatch = $needle === '' || Str::contains($haystack, $needle);
            $rowLocation = Str::lower((string) ($row['location'] ?? ''));
            $rowRemoteType = Str::lower((string) ($row['remote_type'] ?? ''));
            $locationMatch = $preferredLocation === ''
                || Str::contains($rowLocation, $preferredLocation)
                || ($preferredLocation === 'remote' && $rowRemoteType === 'remote');

            $employment = Str::lower((string) ($row['employment_type'] ?? 'unknown'));
            $typeMatch = $preferredType === ''
                || $preferredType === 'any'
                || Str::contains($employment, str_replace('-', '_', $preferredType));

            return $keywordMatch && $locationMatch && $typeMatch;
        }));
    }

    private function parsePostedAt(mixed $value): ?string
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

    private function toEmploymentType(?string $raw): string
    {
        $value = Str::lower((string) $raw);
        if (Str::contains($value, 'full')) {
            return 'full_time';
        }
        if (Str::contains($value, 'part')) {
            return 'part_time';
        }
        if (Str::contains($value, 'contract')) {
            return 'contract';
        }
        if (Str::contains($value, 'intern')) {
            return 'internship';
        }
        if (Str::contains($value, 'freelance')) {
            return 'freelance';
        }
        if (Str::contains($value, 'temp')) {
            return 'temporary';
        }
        return 'unknown';
    }

    private function toRemoteType(?string $raw): string
    {
        $value = Str::lower((string) $raw);
        if (Str::contains($value, 'hybrid')) {
            return 'hybrid';
        }
        if (Str::contains($value, 'onsite') || Str::contains($value, 'on-site') || Str::contains($value, 'on site')) {
            return 'onsite';
        }
        if (Str::contains($value, 'remote')) {
            return 'remote';
        }
        return 'unknown';
    }
}
