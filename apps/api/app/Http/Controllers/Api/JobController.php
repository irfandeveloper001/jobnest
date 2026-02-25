<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\AutoJobSyncJob;
use App\Models\Job;
use App\Models\JobSource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class JobController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'in:all,new,reviewed,applied,rejected,saved,ignored,archived'],
            'location' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $cachePayload = [
            'user_id' => $request->user()?->id,
            'q' => $validated['q'] ?? null,
            'source' => $validated['source'] ?? null,
            'status' => $validated['status'] ?? null,
            'location' => $validated['location'] ?? null,
            'page' => (int) ($validated['page'] ?? 1),
            'per_page' => (int) ($validated['per_page'] ?? 15),
        ];

        $cacheKey = 'jobs:'.md5(json_encode($cachePayload));

        $result = Cache::remember($cacheKey, 60, function () use ($request, $validated, $cachePayload) {
            $user = $request->user();
            $query = Job::query()->with('source:id,key,name');

            if ($user && $user->role !== 'admin' && Schema::hasTable('job_user')) {
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

    public function import(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'keyword' => ['nullable', 'string', 'max:120'],
            'source' => ['nullable', 'in:arbeitnow,remotive,all'],
            'only_new' => ['nullable', 'boolean'],
        ]);

        $keyword = trim((string) ($validated['keyword'] ?? ''));
        $sourceKey = $validated['source'] ?? 'all';
        $onlyNew = (bool) ($validated['only_new'] ?? true);
        $sourceKeys = $sourceKey === 'all' ? ['arbeitnow', 'remotive'] : [$sourceKey];

        $sources = JobSource::query()
            ->whereIn('key', $sourceKeys)
            ->where('enabled', true)
            ->get(['id', 'key']);

        if ($sources->isEmpty()) {
            return response()->json([
                'message' => 'No enabled job sources available for import.',
            ], 422);
        }

        $imported = 0;
        $updated = 0;
        $errors = [];
        $user = $request->user();

        foreach ($sources as $source) {
            try {
                $records = match ($source->key) {
                    'arbeitnow' => $this->fetchArbeitnowJobs($keyword),
                    'remotive' => $this->fetchRemotiveJobs($keyword),
                    default => [],
                };

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
                        'posted_at' => $record['posted_at'] ?? null,
                        'raw_payload' => $record['raw_payload'] ?? null,
                    ];

                    $existing = Job::query()
                        ->where($lookup)
                        ->first();

                    if (! $existing) {
                        $job = Job::query()->create([
                            ...$lookup,
                            ...$attributes,
                            'status' => 'new',
                        ]);
                        $imported++;
                    } else {
                        if (! $onlyNew) {
                            $existing->fill($attributes);
                            if ($existing->isDirty()) {
                                $existing->save();
                                $updated++;
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

                JobSource::query()
                    ->whereKey($source->id)
                    ->update(['last_synced_at' => now()]);
            } catch (Throwable $exception) {
                $errors[] = [
                    'source' => $source->key,
                    'message' => $exception->getMessage(),
                ];
            }
        }

        return response()->json([
            'imported' => $imported,
            'updated' => $updated,
            'total' => $imported + $updated,
            'errors' => $errors,
        ]);
    }

    public function syncNow(Request $request): JsonResponse
    {
        AutoJobSyncJob::dispatch($request->user()->id)->onQueue('default');

        return response()->json([
            'queued' => true,
            'message' => 'Auto sync job queued.',
        ], 202);
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

    private function fetchArbeitnowJobs(string $keyword = ''): array
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

        $normalized = collect($rows)->map(function ($item): array {
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

        return $this->filterByKeyword($normalized->all(), $keyword);
    }

    private function fetchRemotiveJobs(string $keyword = ''): array
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

        return $this->filterByKeyword($normalized->all(), $keyword);
    }

    private function filterByKeyword(array $rows, string $keyword): array
    {
        $needle = Str::lower(trim($keyword));
        if ($needle === '') {
            return $rows;
        }

        return array_values(array_filter($rows, function (array $row) use ($needle): bool {
            $haystack = Str::lower(implode(' ', [
                $row['title'] ?? '',
                $row['company_name'] ?? '',
                $row['location'] ?? '',
                $row['description'] ?? '',
            ]));

            return Str::contains($haystack, $needle);
        }));
    }

    private function parsePostedAt(mixed $value): ?string
    {
        if (! $value) {
            return null;
        }

        try {
            return \Carbon\Carbon::parse($value)->toDateTimeString();
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
