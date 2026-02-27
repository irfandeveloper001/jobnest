<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ImportJobsRequest;
use App\Jobs\AutoJobSyncJob;
use App\Models\City;
use App\Models\Country;
use App\Models\Job;
use App\Models\JobSource;
use App\Models\LocationState;
use App\Models\SyncLog;
use App\Models\User;
use App\Services\JobSources\ArbeitnowClient;
use App\Services\JobSources\JSearchClient;
use App\Services\JobSources\RemotiveClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class JobController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'in:all,arbeitnow,remotive,jsearch'],
            'status' => ['nullable', 'in:all,new,reviewed,applied,rejected,saved,ignored,archived'],
            'location' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'size:2'],
            'remote' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $cachePayload = [
            'user_id' => $request->user()?->id,
            'user_sync_token' => $request->user() ? SyncLog::query()
                ->where('user_id', $request->user()->id)
                ->max('id') : null,
            'q' => $validated['q'] ?? null,
            'source' => $validated['source'] ?? null,
            'status' => $validated['status'] ?? null,
            'location' => $validated['location'] ?? null,
            'country' => isset($validated['country']) ? strtolower((string) $validated['country']) : null,
            'remote' => $request->has('remote')
                ? filter_var($request->input('remote'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
                : null,
            'page' => (int) ($validated['page'] ?? 1),
            'per_page' => (int) ($validated['per_page'] ?? 15),
        ];
        $user = $request->user();
        $defaultLocationNeedles = $user && $user->role !== 'admin' && empty($validated['location'])
            ? $this->resolveDefaultLocationNeedles($user)
            : [];

        if (! empty($defaultLocationNeedles)) {
            $cachePayload['default_location'] = collect($defaultLocationNeedles)
                ->map(fn ($item) => Str::lower((string) $item))
                ->unique()
                ->values()
                ->all();
        }

        $cacheKey = 'jobs:'.md5(json_encode($cachePayload));

        $result = Cache::remember($cacheKey, 60, function () use ($request, $validated, $cachePayload, $defaultLocationNeedles) {
            $user = $request->user();
            $query = Job::query()->with('source:id,key,name');

            if ($user && $user->role !== 'admin' && Schema::hasTable('job_user')) {
                $query->whereDoesntHave('users', function ($userQuery) use ($user): void {
                    $userQuery->where('users.id', $user->id)
                        ->where('job_user.hidden', true);
                });

                $hasVisibleScopedJobs = DB::table('job_user')
                    ->where('user_id', $user->id)
                    ->where('hidden', false)
                    ->exists();

                if ($hasVisibleScopedJobs) {
                    $query->whereHas('users', function ($userQuery) use ($user): void {
                        $userQuery->where('users.id', $user->id)
                            ->where('job_user.hidden', false);
                    });
                }
            }

            if (! empty($validated['q'])) {
                $q = $validated['q'];
                $query->where(function ($inner) use ($q): void {
                    $inner->where('title', 'like', "%{$q}%")
                        ->orWhere('company_name', 'like', "%{$q}%")
                        ->orWhere('description', 'like', "%{$q}%");
                });
            }

            if (! empty($validated['source']) && $validated['source'] !== 'all') {
                $source = $validated['source'];
                $query->whereHas('source', function ($sourceQuery) use ($source): void {
                    $sourceQuery->where('key', $source);
                });
            }

            if (! empty($validated['status']) && $validated['status'] !== 'all') {
                $query->where('status', $this->toInternalStatus($validated['status']));
            }

            if (! empty($validated['location'])) {
                $query->where('location', 'like', '%'.$validated['location'].'%');
            } elseif (! empty($defaultLocationNeedles)) {
                $query->where(function ($inner) use ($defaultLocationNeedles): void {
                    foreach ($defaultLocationNeedles as $needle) {
                        $needle = trim((string) $needle);
                        if ($needle !== '') {
                            $inner->orWhere('location', 'like', '%'.$needle.'%');
                        }
                    }
                });
            }

            if (! empty($validated['country'])) {
                $countryNeedle = strtoupper((string) $validated['country']);
                $query->where(function ($inner) use ($countryNeedle): void {
                    $inner->where('location', 'like', '%'.$countryNeedle.'%')
                        ->orWhere('location', 'like', '%'.strtolower($countryNeedle).'%')
                        ->orWhere('location', 'like', '%'.ucfirst(strtolower($countryNeedle)).'%');
                });
            }

            if ($request->has('remote')) {
                $remoteOnly = filter_var($request->input('remote'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($remoteOnly === true) {
                    $query->where('remote_type', 'remote');
                } elseif ($remoteOnly === false) {
                    $query->where('remote_type', '!=', 'remote');
                }
            }

            $paginator = $query
                ->orderByDesc('posted_at')
                ->orderByDesc('id')
                ->paginate($cachePayload['per_page'], ['*'], 'page', $cachePayload['page']);

            $data = $paginator->getCollection()
                ->map(fn (Job $job): array => $this->serializeJob($job))
                ->values();

            return [
                'data' => $data,
                'meta' => [
                    'page' => $paginator->currentPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                    'last_page' => $paginator->lastPage(),
                ],
            ];
        });

        return response()->json($result);
    }

    public function show(Job $job): JsonResponse
    {
        $job->load(['source:id,key,name', 'recipients']);

        return response()->json([
            'data' => [
                ...$this->serializeJob($job),
                'remote_type' => $job->remote_type,
                'employment_type' => $job->employment_type,
                'url' => $job->url,
                'salary_min' => $job->salary_min,
                'salary_max' => $job->salary_max,
                'salary_currency' => $job->salary_currency,
                'description' => $job->description,
                'raw_payload' => $job->raw_payload,
            ],
        ]);
    }

    public function import(
        ImportJobsRequest $request,
        JSearchClient $jSearchClient,
        ArbeitnowClient $arbeitnowClient,
        RemotiveClient $remotiveClient
    ): JsonResponse
    {
        $validated = $request->validated();

        $keyword = trim((string) ($validated['keyword'] ?? ''));
        $sourceKey = $validated['source'] ?? 'all';
        $onlyNew = (bool) ($validated['only_new'] ?? true);
        $country = strtolower(trim((string) ($validated['country'] ?? 'pk')));
        $remoteOnly = array_key_exists('remote', $validated)
            ? filter_var($validated['remote'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
            : null;
        $datePosted = $validated['date_posted'] ?? null;
        $employmentTypes = $validated['employment_types'] ?? null;
        $page = max(1, (int) ($validated['page'] ?? 1));
        $numPages = max(1, (int) ($validated['num_pages'] ?? 1));

        $rapidApiKey = trim((string) config('services.rapidapi.key', ''));
        $user = $request->user();
        $imported = 0;
        $updated = 0;
        $errors = [];
        $warnings = [];
        $usedSource = $sourceKey;
        $fallbackSources = [];
        $jsearchOptions = [
            'query' => $keyword,
            'country' => $country ?: 'pk',
            'page' => $page,
            'num_pages' => $numPages,
            'date_posted' => $datePosted,
            'remote_jobs_only' => $remoteOnly,
            'employment_types' => $employmentTypes,
        ];

        $sources = JobSource::query()
            ->whereIn('key', ['arbeitnow', 'remotive', 'jsearch'])
            ->where('enabled', true)
            ->get(['id', 'key'])
            ->keyBy('key');

        $importFreeSources = function () use (
            $sources,
            $keyword,
            $country,
            $remoteOnly,
            $onlyNew,
            $user,
            $arbeitnowClient,
            $remotiveClient,
            &$imported,
            &$updated,
            &$errors
        ): void {
            foreach (['arbeitnow', 'remotive'] as $key) {
                $source = $sources->get($key);
                if (! $source) {
                    continue;
                }

                try {
                    $records = match ($key) {
                        'arbeitnow' => $this->applyImportConstraints(
                            $arbeitnowClient->search($keyword),
                            $country,
                            $remoteOnly
                        ),
                        'remotive' => $this->applyImportConstraints(
                            $remotiveClient->search($keyword),
                            $country,
                            $remoteOnly
                        ),
                        default => [],
                    };

                    [$fetched, $created, $changed] = $this->runImportForSource($source, $records, $onlyNew, $user);
                    $imported += $created;
                    $updated += $changed;
                } catch (Throwable $exception) {
                    $errors[] = [
                        'source' => $key,
                        'message' => $exception->getMessage(),
                    ];
                    logger()->warning('Job import source failed', [
                        'source' => $key,
                        'message' => $exception->getMessage(),
                        'user_id' => $user?->id,
                    ]);
                }
            }
        };

        if ($sources->isEmpty()) {
            return response()->json([
                'message' => 'No enabled job sources available for import.',
            ], 422);
        }

        if (in_array($sourceKey, ['arbeitnow', 'remotive'], true)) {
            $source = $sources->get($sourceKey);
            if (! $source) {
                return response()->json([
                    'message' => 'Selected source is not enabled.',
                ], 422);
            }

            try {
                $records = match ($sourceKey) {
                    'arbeitnow' => $this->applyImportConstraints(
                        $arbeitnowClient->search($keyword),
                        $country,
                        $remoteOnly
                    ),
                    'remotive' => $this->applyImportConstraints(
                        $remotiveClient->search($keyword),
                        $country,
                        $remoteOnly
                    ),
                    default => [],
                };

                [$fetched, $created, $changed] = $this->runImportForSource($source, $records, $onlyNew, $user);
                $imported += $created;
                $updated += $changed;
            } catch (Throwable $exception) {
                $errors[] = [
                    'source' => $sourceKey,
                    'message' => $exception->getMessage(),
                ];
                logger()->warning('Job import source failed', [
                    'source' => $sourceKey,
                    'message' => $exception->getMessage(),
                    'user_id' => $user?->id,
                ]);
            }

            return response()->json([
                'used_source' => $sourceKey,
                'fallback_sources' => [],
                'warning' => null,
                'warnings' => [],
                'imported' => $imported,
                'updated' => $updated,
                'total' => $imported + $updated,
                'errors' => $errors,
            ]);
        }

        if ($sourceKey === 'all') {
            $importFreeSources();

            if ($rapidApiKey === '') {
                $this->pushUniqueWarning($warnings, 'JSearch key invalid. Using free sources.');
            } elseif ($this->isJsearchBlocked()) {
                $this->pushUniqueWarning($warnings, 'JSearch quota exceeded. Using free sources.');
            } elseif ($sources->has('jsearch')) {
                $source = $sources->get('jsearch');
                try {
                    $records = $this->applyImportConstraints(
                        $this->fetchJsearchJobsWithCache($jSearchClient, $jsearchOptions),
                        $country,
                        $remoteOnly
                    );

                    [$fetched, $created, $changed] = $this->runImportForSource($source, $records, $onlyNew, $user);
                    $imported += $created;
                    $updated += $changed;
                } catch (Throwable $exception) {
                    $errors[] = [
                        'source' => 'jsearch',
                        'message' => $exception->getMessage(),
                    ];
                    logger()->warning('Job import source failed', [
                        'source' => 'jsearch',
                        'message' => $exception->getMessage(),
                        'user_id' => $user?->id,
                    ]);
                    $mapped = $this->mapJsearchErrorToUserMessage($exception);
                    $this->pushUniqueWarning($warnings, $mapped);

                    if ($this->isJsearchQuotaError($exception)) {
                        $this->markJsearchBlocked();
                    }
                }
            }
        }

        if ($sourceKey === 'jsearch') {
            $attemptJsearch = $rapidApiKey !== '' && ! $this->isJsearchBlocked() && $sources->has('jsearch');
            if ($attemptJsearch) {
                $source = $sources->get('jsearch');

                try {
                    $records = $this->applyImportConstraints(
                        $this->fetchJsearchJobsWithCache($jSearchClient, $jsearchOptions),
                        $country,
                        $remoteOnly
                    );

                    [$fetched, $created, $changed] = $this->runImportForSource($source, $records, $onlyNew, $user);
                    $imported += $created;
                    $updated += $changed;
                } catch (Throwable $exception) {
                    $errors[] = [
                        'source' => 'jsearch',
                        'message' => $exception->getMessage(),
                    ];
                    logger()->warning('Job import source failed', [
                        'source' => 'jsearch',
                        'message' => $exception->getMessage(),
                        'user_id' => $user?->id,
                    ]);

                    $mapped = $this->mapJsearchErrorToUserMessage($exception);
                    $this->pushUniqueWarning($warnings, $mapped);

                    if ($this->isJsearchQuotaError($exception)) {
                        $this->markJsearchBlocked();
                    }

                    $usedSource = 'fallback';
                    $fallbackSources = ['arbeitnow', 'remotive'];
                    $importFreeSources();
                }
            } else {
                $mapped = $rapidApiKey === ''
                    ? 'JSearch key invalid. Using free sources.'
                    : 'JSearch quota exceeded. Using free sources.';
                $this->pushUniqueWarning($warnings, $mapped);
                $usedSource = 'fallback';
                $fallbackSources = ['arbeitnow', 'remotive'];
                $importFreeSources();
            }
        }

        if ($sourceKey === 'jsearch' && $usedSource === 'fallback' && ($imported + $updated) === 0 && ! empty($errors)) {
            return response()->json([
                'message' => $warnings[0] ?? 'Job import failed. Please retry.',
                'used_source' => $usedSource,
                'fallback_sources' => $fallbackSources,
                'warning' => $warnings[0] ?? null,
                'warnings' => $warnings,
                'imported' => $imported,
                'updated' => $updated,
                'total' => $imported + $updated,
                'errors' => $errors,
            ], 422);
        }

        return response()->json([
            'used_source' => $usedSource,
            'fallback_sources' => $fallbackSources,
            'warning' => $warnings[0] ?? null,
            'warnings' => $warnings,
            'imported' => $imported,
            'updated' => $updated,
            'total' => $imported + $updated,
            'errors' => $errors,
        ]);
    }

    public function syncNow(Request $request): JsonResponse
    {
        $user = $request->user();
        $userId = $user->id;
        $startedAt = now();

        try {
            AutoJobSyncJob::dispatchSync($userId);

            $defaultLocationNeedles = $this->resolveDefaultLocationNeedles($user);
            $matchedJobs = Job::query()
                ->whereHas('users', function ($query) use ($userId): void {
                    $query->where('users.id', $userId)->where('job_user.hidden', false);
                })
                ->when(! empty($defaultLocationNeedles), function ($query) use ($defaultLocationNeedles): void {
                    $query->where(function ($inner) use ($defaultLocationNeedles): void {
                        foreach ($defaultLocationNeedles as $needle) {
                            $inner->orWhere('location', 'like', '%'.$needle.'%');
                        }
                    });
                })
                ->count();

            $logs = SyncLog::query()
                ->where('user_id', $userId)
                ->where('started_at', '>=', $startedAt->copy()->subSeconds(10))
                ->orderByDesc('id')
                ->get(['jobs_fetched', 'jobs_created', 'jobs_updated']);

            $fetched = (int) $logs->sum('jobs_fetched');
            $created = (int) $logs->sum('jobs_created');
            $updated = (int) $logs->sum('jobs_updated');

            return response()->json([
                'queued' => false,
                'synced' => true,
                'fetched' => $fetched,
                'created' => $created,
                'updated' => $updated,
                'matched_jobs' => $matchedJobs,
                'message' => $matchedJobs > 0
                    ? 'Auto sync completed.'
                    : 'Auto sync completed, but no jobs matched your current city/state/country filters.',
            ]);
        } catch (Throwable $exception) {
            AutoJobSyncJob::dispatch($userId)->onQueue('default');

            return response()->json([
                'queued' => true,
                'synced' => false,
                'message' => 'Auto sync queued in background.',
                'error' => Str::limit($exception->getMessage(), 300),
            ], 202);
        }
    }

    public function updateStatus(Request $request, Job $job): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:new,reviewed,applied,rejected,saved,ignored,archived'],
        ]);

        $job->update([
            'status' => $this->toInternalStatus($validated['status']),
        ]);

        return response()->json([
            'message' => 'Job status updated.',
            'data' => $this->serializeJob($job->fresh(['source:id,key,name'])),
        ]);
    }

    public function archive(Request $request, Job $job): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'admin') {
            $job->update(['status' => 'archived']);

            return response()->json([
                'message' => 'Job archived.',
                'data' => $this->serializeJob($job->fresh(['source:id,key,name'])),
            ]);
        }

        if (Schema::hasTable('job_user')) {
            DB::table('job_user')->updateOrInsert(
                [
                    'user_id' => $user->id,
                    'job_id' => $job->id,
                ],
                [
                    'saved' => false,
                    'hidden' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        } else {
            $job->update(['status' => 'archived']);
        }

        return response()->json([
            'message' => 'Job archived.',
        ]);
    }

    public function destroy(Request $request, Job $job): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'admin') {
            $job->delete();

            return response()->json([
                'message' => 'Job deleted.',
            ]);
        }

        if (Schema::hasTable('job_user')) {
            DB::table('job_user')->updateOrInsert(
                [
                    'user_id' => $user->id,
                    'job_id' => $job->id,
                ],
                [
                    'saved' => false,
                    'hidden' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        } else {
            $job->update(['status' => 'archived']);
        }

        return response()->json([
            'message' => 'Job removed from your list.',
        ]);
    }

    private function serializeJob(Job $job): array
    {
        return [
            'id' => $job->id,
            'title' => $job->title,
            'company' => $job->company_name,
            'company_name' => $job->company_name,
            'location' => $job->location,
            'source' => $job->source?->key,
            'source_name' => $job->source?->name,
            'status' => $this->toPublicStatus($job->status),
            'posted_at' => optional($job->posted_at)->toISOString(),
            'url' => $job->url,
        ];
    }

    private function toPublicStatus(?string $status): string
    {
        return match ($status) {
            'saved' => 'reviewed',
            'ignored', 'archived' => 'rejected',
            default => $status ?: 'new',
        };
    }

    private function toInternalStatus(?string $status): string
    {
        return match ($status) {
            'reviewed' => 'saved',
            'rejected' => 'ignored',
            default => $status ?: 'new',
        };
    }

    private function runImportForSource(
        JobSource $source,
        array $records,
        bool $onlyNew,
        ?User $user
    ): array {
        $startedAt = now();
        $syncLog = SyncLog::query()->create([
            'source_id' => $source->id,
            'user_id' => $user?->id,
            'status' => 'success',
            'started_at' => $startedAt,
            'jobs_fetched' => 0,
            'jobs_created' => 0,
            'jobs_updated' => 0,
        ]);

        try {
            $jobsFetched = count($records);
            [$jobsCreated, $jobsUpdated] = $this->persistImportedJobs($source, $records, $onlyNew, $user);

            $syncLog->update([
                'status' => 'success',
                'ended_at' => now(),
                'runtime_ms' => (int) $startedAt->diffInMilliseconds(now()),
                'jobs_fetched' => $jobsFetched,
                'jobs_created' => $jobsCreated,
                'jobs_updated' => $jobsUpdated,
                'error_message' => null,
            ]);

            JobSource::query()
                ->whereKey($source->id)
                ->update(['last_synced_at' => now()]);

            return [$jobsFetched, $jobsCreated, $jobsUpdated];
        } catch (Throwable $exception) {
            $syncLog->update([
                'status' => 'failed',
                'ended_at' => now(),
                'runtime_ms' => (int) $startedAt->diffInMilliseconds(now()),
                'error_message' => Str::limit($exception->getMessage(), 1000),
            ]);

            throw $exception;
        }
    }

    private function persistImportedJobs(JobSource $source, array $records, bool $onlyNew, ?User $user): array
    {
        $created = 0;
        $changed = 0;

        foreach ($records as $record) {
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

            $existing = Job::query()->where($lookup)->first();

            if (! $existing) {
                $job = Job::query()->create([
                    ...$lookup,
                    ...$attributes,
                    'status' => 'new',
                ]);
                $created++;
            } else {
                if (! $onlyNew) {
                    $existing->fill($attributes);
                    if ($existing->isDirty()) {
                        $existing->save();
                        $changed++;
                    }
                }
                $job = $existing;
            }

            if ($user && Schema::hasTable('job_user')) {
                DB::table('job_user')->updateOrInsert(
                    [
                        'user_id' => $user->id,
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

        return [$created, $changed];
    }

    private function fetchJsearchJobsWithCache(JSearchClient $jSearchClient, array $options): array
    {
        $cacheable = [
            'query' => trim((string) ($options['query'] ?? '')),
            'country' => strtolower(trim((string) ($options['country'] ?? 'pk'))),
            'remote' => $options['remote_jobs_only'] ?? null,
            'page' => (int) ($options['page'] ?? 1),
            'num_pages' => (int) ($options['num_pages'] ?? 1),
            'date_posted' => $options['date_posted'] ?? null,
            'employment_types' => $options['employment_types'] ?? null,
        ];

        $cacheKey = 'jsearch:search:'.md5(json_encode($cacheable));

        return Cache::remember($cacheKey, now()->addMinutes(10), function () use ($jSearchClient, $options): array {
            return $jSearchClient->search($options);
        });
    }

    private function markJsearchBlocked(): void
    {
        Cache::put('jsearch:blocked', true, now()->addMinutes(30));
    }

    private function isJsearchBlocked(): bool
    {
        return Cache::get('jsearch:blocked', false) === true;
    }

    private function mapJsearchErrorToUserMessage(Throwable $exception): string
    {
        $message = Str::lower((string) $exception->getMessage());

        if (Str::contains($message, ['quota', 'too many requests', 'rate limit', '429'])) {
            return 'JSearch quota exceeded. Using free sources.';
        }

        if (Str::contains($message, ['key invalid', 'unauthorized', 'forbidden', '401', '403'])) {
            return 'JSearch key invalid. Using free sources.';
        }

        return 'Job import failed. Please retry.';
    }

    private function isJsearchQuotaError(Throwable $exception): bool
    {
        $message = Str::lower((string) $exception->getMessage());
        return Str::contains($message, ['quota', 'too many requests', 'rate limit', '429']);
    }

    private function pushUniqueWarning(array &$warnings, string $message): void
    {
        $message = trim($message);
        if ($message === '' || in_array($message, $warnings, true)) {
            return;
        }

        $warnings[] = $message;
    }

    private function applyImportConstraints(array $rows, string $country = '', ?bool $remoteOnly = null): array
    {
        $country = strtolower(trim($country));

        return array_values(array_filter($rows, function (array $row) use ($country, $remoteOnly): bool {
            $location = strtolower((string) ($row['location'] ?? ''));
            $remoteType = strtolower((string) ($row['remote_type'] ?? 'unknown'));

            $countryMatch = true;
            if ($country !== '') {
                $countryMatch = $this->matchesCountryInLocation($location, $country);
            }

            $remoteMatch = true;
            if ($remoteOnly !== null) {
                $isRemote = $remoteType === 'remote';
                $remoteMatch = $remoteOnly ? $isRemote : ! $isRemote;
            }

            return $countryMatch && $remoteMatch;
        }));
    }

    private function matchesCountryInLocation(string $location, string $country): bool
    {
        if ($country === '') {
            return true;
        }

        if (Str::contains($location, strtolower($country))) {
            return true;
        }

        $countryName = Country::query()
            ->whereRaw('LOWER(iso2) = ?', [strtolower($country)])
            ->value('name');

        if ($countryName && Str::contains($location, strtolower((string) $countryName))) {
            return true;
        }

        return false;
    }

    private function resolveDefaultLocationNeedles(User $user): array
    {
        $needles = [];

        if (! empty($user->preferred_city_id)) {
            $cityName = City::query()->whereKey($user->preferred_city_id)->value('name');
            if ($cityName) {
                $needles[] = trim((string) $cityName);
            }
        }

        if (! empty($user->preferred_state_id)) {
            $stateName = LocationState::query()->whereKey($user->preferred_state_id)->value('name');
            if ($stateName) {
                $needles[] = trim((string) $stateName);
            }
        }

        if (! empty($user->preferred_country_id)) {
            $countryName = Country::query()->whereKey($user->preferred_country_id)->value('name');
            if ($countryName) {
                $needles[] = trim((string) $countryName);
            }
        }

        if (empty($needles) && ! empty($user->preferred_location)) {
            $fallback = trim((string) explode(',', (string) $user->preferred_location)[0]);
            if ($fallback !== '') {
                $needles[] = $fallback;
            }
        }

        return collect($needles)
            ->filter(fn ($item) => $item !== '')
            ->unique()
            ->values()
            ->all();
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
