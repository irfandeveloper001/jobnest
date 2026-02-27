<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\ApplicationStage;
use App\Models\EmailLog;
use App\Models\Followup;
use App\Models\InboxThread;
use App\Models\Interview;
use App\Models\Job;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class MetricsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        $cacheKey = "metrics:user:{$userId}";

        $metrics = Cache::remember($cacheKey, 30, function () use ($userId): array {
            $stageCounts = ApplicationStage::query()
                ->orderBy('sort_order')
                ->get(['key'])
                ->mapWithKeys(function (ApplicationStage $stage) use ($userId): array {
                    $count = Application::where('user_id', $userId)
                        ->where('stage_key', $stage->key)
                        ->count();

                    return [$stage->key => $count];
                })
                ->all();

            $followupsDue = Followup::query()
                ->where('user_id', $userId)
                ->where('status', 'pending')
                ->where('due_at', '<=', now())
                ->count();

            return [
                'total_jobs' => Job::count(),
                'new_jobs' => Job::where('status', 'new')->count(),
                'saved_jobs' => Job::where('status', 'saved')->count(),
                'applied_jobs' => Job::where('status', 'applied')->count(),
                'applications_total' => Application::where('user_id', $userId)->count(),
                'applications_queued' => Application::where('user_id', $userId)->where('status', 'queued')->count(),
                'applications_sent' => Application::where('user_id', $userId)->where('status', 'sent')->count(),
                'interviews_scheduled' => Interview::where('user_id', $userId)->where('status', 'upcoming')->count(),
                'email_failures' => EmailLog::where('user_id', $userId)->where('status', 'failed')->count(),
                'inbox_threads' => InboxThread::count(),
                'stage_counts' => $stageCounts,
                'followups_due' => $followupsDue,
            ];
        });

        return response()->json([
            'data' => $metrics,
        ]);
    }
}
