<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\JobSource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JobSourceAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $sources = JobSource::query()->orderBy('id')->get();

        return response()->json([
            'data' => $sources,
        ]);
    }

    public function update(Request $request, JobSource $jobSource): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'base_url' => ['nullable', 'string', 'max:2048'],
            'enabled' => ['sometimes', 'boolean'],
            'sync_interval_minutes' => ['sometimes', 'integer', 'min:1', 'max:1440'],
        ]);

        $jobSource->update($validated);

        return response()->json([
            'message' => 'Job source updated.',
            'data' => $jobSource->fresh(),
        ]);
    }
}
