<?php

namespace App\Jobs;

use App\Models\Job;
use App\Models\JobSource;
use App\Models\SyncLog;
use App\Models\User;
use App\Services\JobSources\ArbeitnowClient;
use App\Services\JobSources\JSearchClient;
use App\Services\JobSources\RemotiveClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
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
            ->whereIn('key', ['arbeitnow', 'remotive', 'jsearch'])
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
                    $records = match ($source->key) {
                        'arbeitnow' => $this->fetchArbeitnowJobs((string) $keyword, $user),
                        'remotive' => $this->fetchRemotiveJobs((string) $keyword, $user),
                        'jsearch' => $this->fetchJsearchJobs((string) $keyword, $user),
                        default => [],
                    };

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
                        'tags' => $record['tags'] ?? null,
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
        $client = app(ArbeitnowClient::class);
        $rows = $client->search($keyword);
        return $this->applyPreferenceFilter($rows, $keyword, $user);
    }

    private function fetchRemotiveJobs(string $keyword, User $user): array
    {
        $client = app(RemotiveClient::class);
        $rows = $client->search($keyword);
        return $this->applyPreferenceFilter($rows, $keyword, $user);
    }

    private function fetchJsearchJobs(string $keyword, User $user): array
    {
        $rapidApiKey = trim((string) config('services.rapidapi.key', ''));
        if ($rapidApiKey === '') {
            return [];
        }

        $countryIso2 = strtolower(trim((string) ($user->preferredCountry?->iso2 ?? 'pk')));
        $client = app(JSearchClient::class);
        $rows = $client->search([
            'query' => $keyword !== '' ? $keyword : 'software engineer',
            'country' => $countryIso2 !== '' ? $countryIso2 : 'pk',
            'page' => 1,
            'num_pages' => 1,
        ]);

        return $this->applyPreferenceFilter($rows, $keyword, $user);
    }

    private function applyPreferenceFilter(array $rows, string $keyword, User $user): array
    {
        $needle = Str::lower(trim($keyword));
        $locationNeedles = collect([
            $user->preferredCity?->name,
            $user->preferredState?->name,
            $user->preferredCountry?->name,
        ])
            ->filter(fn ($value) => filled($value))
            ->map(fn ($value) => Str::lower(trim((string) $value)))
            ->unique()
            ->values()
            ->all();
        $preferredType = Str::lower(trim((string) ($user->preferred_job_type ?? 'any')));
        $includeRemoteRaw = data_get($user, 'include_remote');
        $includeRemote = filter_var($includeRemoteRaw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        $filtered = array_values(array_filter($rows, function (array $row) use ($needle, $locationNeedles, $preferredType, $includeRemote): bool {
            $haystack = Str::lower(implode(' ', [
                $row['title'] ?? '',
                $row['company_name'] ?? '',
                $row['location'] ?? '',
                $row['description'] ?? '',
            ]));

            $keywordMatch = $needle === '' || Str::contains($haystack, $needle);
            $rowLocation = Str::lower((string) ($row['location'] ?? ''));
            $locationMatch = empty($locationNeedles)
                || collect($locationNeedles)->contains(fn ($item) => Str::contains($rowLocation, $item));

            $employment = Str::lower((string) ($row['employment_type'] ?? 'unknown'));
            $typeMatch = $preferredType === ''
                || $preferredType === 'any'
                || $employment === 'unknown'
                || Str::contains($employment, str_replace('-', '_', $preferredType));

            $remoteType = $this->toRemoteType($row['remote_type'] ?? $row['location'] ?? null);
            $remoteMatch = $includeRemote !== false || $remoteType !== 'remote';

            return $keywordMatch && $locationMatch && $typeMatch && $remoteMatch;
        }));

        if (! empty($filtered)) {
            return $filtered;
        }

        // If user has selected preferred location, keep results scoped to that location hierarchy.
        if (! empty($locationNeedles)) {
            return [];
        }

        // Relax location constraints first to avoid empty results for narrow city-only matches.
        $byKeywordAndType = array_values(array_filter($rows, function (array $row) use ($needle, $preferredType, $includeRemote): bool {
            $haystack = Str::lower(implode(' ', [
                $row['title'] ?? '',
                $row['company_name'] ?? '',
                $row['location'] ?? '',
                $row['description'] ?? '',
            ]));

            $keywordMatch = $needle === '' || Str::contains($haystack, $needle);
            $employment = Str::lower((string) ($row['employment_type'] ?? 'unknown'));
            $typeMatch = $preferredType === ''
                || $preferredType === 'any'
                || $employment === 'unknown'
                || Str::contains($employment, str_replace('-', '_', $preferredType));

            $remoteType = $this->toRemoteType($row['remote_type'] ?? $row['location'] ?? null);
            $remoteMatch = $includeRemote !== false || $remoteType !== 'remote';

            return $keywordMatch && $typeMatch && $remoteMatch;
        }));

        if (! empty($byKeywordAndType)) {
            return $byKeywordAndType;
        }

        $byTypeOnly = array_values(array_filter($rows, function (array $row) use ($preferredType, $includeRemote): bool {
            $employment = Str::lower((string) ($row['employment_type'] ?? 'unknown'));
            $remoteType = $this->toRemoteType($row['remote_type'] ?? $row['location'] ?? null);
            $remoteMatch = $includeRemote !== false || $remoteType !== 'remote';

            return $remoteMatch && ($preferredType === ''
                || $preferredType === 'any'
                || $employment === 'unknown'
                || Str::contains($employment, str_replace('-', '_', $preferredType)));
        }));

        if (! empty($byTypeOnly)) {
            return $byTypeOnly;
        }

        return $rows;
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
