<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\EmailLog;
use App\Models\InboxThread;
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
            return [
                'total_jobs' => Job::count(),
                'new_jobs' => Job::where('status', 'new')->count(),
                'saved_jobs' => Job::where('status', 'saved')->count(),
                'applied_jobs' => Job::where('status', 'applied')->count(),
                'applications_total' => Application::where('user_id', $userId)->count(),
                'applications_queued' => Application::where('user_id', $userId)->where('status', 'queued')->count(),
                'applications_sent' => Application::where('user_id', $userId)->where('status', 'sent')->count(),
                'email_failures' => EmailLog::where('user_id', $userId)->where('status', 'failed')->count(),
                'inbox_threads' => InboxThread::count(),
            ];
        });

        return response()->json([
            'data' => $metrics,
        ]);
    }
}
