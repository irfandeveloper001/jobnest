<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Job;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class JobController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'in:new,saved,applied,ignored,archived'],
            'location' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $cachePayload = [
            'q' => $validated['q'] ?? null,
            'source' => $validated['source'] ?? null,
            'status' => $validated['status'] ?? null,
            'location' => $validated['location'] ?? null,
            'page' => (int) ($validated['page'] ?? 1),
            'per_page' => (int) ($validated['per_page'] ?? 15),
        ];

        $cacheKey = 'jobs:'.md5(json_encode($cachePayload));

        $result = Cache::remember($cacheKey, 60, function () use ($validated, $cachePayload) {
            $query = Job::query()->with('source');

            if (! empty($validated['q'])) {
                $q = $validated['q'];
                $query->where(function ($inner) use ($q): void {
                    $inner->where('title', 'like', "%{$q}%")
                        ->orWhere('company_name', 'like', "%{$q}%")
                        ->orWhere('description', 'like', "%{$q}%");
                });
            }

            if (! empty($validated['source'])) {
                $source = $validated['source'];
                $query->whereHas('source', function ($sourceQuery) use ($source): void {
                    $sourceQuery->where('key', $source);
                });
            }

            if (! empty($validated['status'])) {
                $query->where('status', $validated['status']);
            }

            if (! empty($validated['location'])) {
                $query->where('location', 'like', '%'.$validated['location'].'%');
            }

            return $query
                ->orderByDesc('posted_at')
                ->orderByDesc('id')
                ->paginate($cachePayload['per_page'], ['*'], 'page', $cachePayload['page']);
        });

        return response()->json($result);
    }

    public function show(Job $job): JsonResponse
    {
        $job->load(['source', 'recipients']);

        return response()->json([
            'data' => $job,
        ]);
    }

    public function updateStatus(Request $request, Job $job): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:new,saved,applied,ignored,archived'],
        ]);

        $job->update([
            'status' => $validated['status'],
        ]);

        return response()->json([
            'message' => 'Job status updated.',
            'data' => $job->fresh(['source']),
        ]);
    }
}
