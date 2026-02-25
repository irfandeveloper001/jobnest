<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\Job;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class AnalyticsController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'range' => ['nullable', 'in:7,30,90'],
        ]);

        $rangeDays = (int) ($validated['range'] ?? 30);
        $user = $request->user();
        $isAdmin = $user->role === 'admin';
        $end = Carbon::now()->endOfDay();
        $start = Carbon::now()->subDays($rangeDays - 1)->startOfDay();

        $applicationsInRange = $this->baseApplicationsQuery($isAdmin ? null : $user->id)
            ->whereBetween('created_at', [$start, $end]);

        $repliedScope = fn (Builder $query): Builder => $query->where(function (Builder $inner): void {
            $inner->whereNotNull('meta->replied_at')
                ->orWhere('meta->reply_received', true);
        });

        $emailedOrRepliedScope = fn (Builder $query): Builder => $query->where(function (Builder $inner): void {
            $inner->where('status', 'sent')
                ->orWhereNotNull('meta->replied_at')
                ->orWhere('meta->reply_received', true);
        });

        $applicationsSubmitted = (clone $applicationsInRange)->count();
        $repliesReceived = $repliedScope((clone $applicationsInRange))->count();
        $applicationsEmailed = $emailedOrRepliedScope((clone $applicationsInRange))->count();
        $applicationsEmailedOnly = max(0, $applicationsEmailed - $repliesReceived);
        $submittedOnly = max(0, $applicationsSubmitted - $applicationsEmailedOnly - $repliesReceived);

        $jobsImportedQuery = Job::query()
            ->whereBetween('jobs.created_at', [$start, $end]);
        if (! $isAdmin) {
            $jobsImportedQuery->whereHas('applications', function (Builder $applications) use ($user): void {
                $applications->where('user_id', $user->id);
            });
        }
        $jobsImported = $jobsImportedQuery->count();

        $replyRate = $applicationsEmailed > 0
            ? round(($repliesReceived / $applicationsEmailed) * 100, 2)
            : 0.0;

        $avgReplyTimeHours = $this->calculateAvgReplyTimeHours(
            $this->baseApplicationsQuery($isAdmin ? null : $user->id)
                ->whereBetween('created_at', [$start, $end])
                ->whereNotNull('emailed_at')
                ->where(function (Builder $query): void {
                    $query->whereNotNull('meta->replied_at')
                        ->orWhere('meta->reply_received', true);
                })
                ->get(['emailed_at', 'meta'])
        );

        $labels = [];
        $applicationsTrend = [];
        $repliesTrend = [];

        $applicationsDaily = (clone $applicationsInRange)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $repliesDaily = $repliedScope((clone $applicationsInRange))
            ->get(['created_at', 'meta'])
            ->reduce(function (array $carry, Application $application): array {
                $metaReplyDate = data_get($application->meta, 'replied_at');
                $day = null;
                if ($metaReplyDate) {
                    try {
                        $day = Carbon::parse($metaReplyDate)->toDateString();
                    } catch (\Throwable $exception) {
                        $day = null;
                    }
                }

                if (! $day) {
                    $day = optional($application->created_at)->toDateString();
                }

                if ($day) {
                    $carry[$day] = ($carry[$day] ?? 0) + 1;
                }

                return $carry;
            }, []);

        foreach (CarbonPeriod::create($start, '1 day', $end) as $day) {
            $key = $day->format('Y-m-d');
            $labels[] = $key;
            $applicationsTrend[] = (int) ($applicationsDaily[$key] ?? 0);
            $repliesTrend[] = (int) ($repliesDaily[$key] ?? 0);
        }

        $jobsBySource = Job::query()
            ->leftJoin('job_sources', 'jobs.source_id', '=', 'job_sources.id')
            ->selectRaw("COALESCE(job_sources.key, 'manual') as source_key, COUNT(jobs.id) as jobs_count")
            ->whereBetween('jobs.created_at', [$start, $end]);

        if (! $isAdmin) {
            $jobsBySource->whereExists(function ($query) use ($user): void {
                $query->selectRaw('1')
                    ->from('applications')
                    ->whereColumn('applications.job_id', 'jobs.id')
                    ->where('applications.user_id', $user->id);
            });
        }

        $jobsBySource = $jobsBySource->groupBy('source_key')->pluck('jobs_count', 'source_key');

        $applicationsBySource = $this->baseApplicationsQuery($isAdmin ? null : $user->id)
            ->leftJoin('jobs', 'applications.job_id', '=', 'jobs.id')
            ->leftJoin('job_sources', 'jobs.source_id', '=', 'job_sources.id')
            ->selectRaw("COALESCE(job_sources.key, 'manual') as source_key, COUNT(applications.id) as applications_count")
            ->whereBetween('applications.created_at', [$start, $end])
            ->groupBy('source_key')
            ->pluck('applications_count', 'source_key');

        $sourceKeys = array_values(array_unique(array_merge(
            ['arbeitnow', 'remotive', 'manual'],
            array_keys($jobsBySource->toArray()),
            array_keys($applicationsBySource->toArray())
        )));

        $bySource = array_map(function (string $source) use ($jobsBySource, $applicationsBySource): array {
            return [
                'source' => $source,
                'jobs' => (int) ($jobsBySource[$source] ?? 0),
                'applications' => (int) ($applicationsBySource[$source] ?? 0),
            ];
        }, $sourceKeys);

        return response()->json([
            'range_days' => $rangeDays,
            'kpis' => [
                'jobs_imported' => (int) $jobsImported,
                'applications_submitted' => (int) $applicationsSubmitted,
                'applications_emailed' => (int) $applicationsEmailed,
                'replies_received' => (int) $repliesReceived,
                'reply_rate' => (float) $replyRate,
                'avg_reply_time_hours' => $avgReplyTimeHours,
            ],
            'trends' => [
                'labels' => $labels,
                'applications' => $applicationsTrend,
                'replies' => $repliesTrend,
            ],
            'breakdowns' => [
                'by_source' => $bySource,
                'by_status' => [
                    ['status' => 'submitted', 'count' => (int) $submittedOnly],
                    ['status' => 'emailed', 'count' => (int) $applicationsEmailedOnly],
                    ['status' => 'replied', 'count' => (int) $repliesReceived],
                ],
            ],
        ]);
    }

    private function baseApplicationsQuery(?int $userId): Builder
    {
        $query = Application::query();
        if ($userId) {
            $query->where('user_id', $userId);
        }

        return $query;
    }

    private function calculateAvgReplyTimeHours(Collection $applications): ?float
    {
        $durations = $applications->map(function (Application $application): ?float {
            $repliedAtRaw = data_get($application->meta, 'replied_at');
            if (! $repliedAtRaw || ! $application->emailed_at) {
                return null;
            }

            try {
                $repliedAt = Carbon::parse($repliedAtRaw);
            } catch (\Throwable $exception) {
                return null;
            }

            if ($repliedAt->lessThanOrEqualTo($application->emailed_at)) {
                return null;
            }

            return round($application->emailed_at->diffInMinutes($repliedAt) / 60, 2);
        })->filter(fn ($value): bool => $value !== null)->values();

        if ($durations->isEmpty()) {
            return null;
        }

        return round($durations->avg(), 2);
    }
}
