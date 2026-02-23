<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendApplicationEmailJob;
use App\Models\Application;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApplicationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'job_id' => ['required', 'integer', 'exists:jobs,id'],
            'full_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'cover_note' => ['nullable', 'string', 'max:5000'],
            'cv_file' => ['required', 'file', 'mimes:pdf,doc,docx', 'max:5120'],
        ]);

        $user = $request->user();
        $cvPath = $request->file('cv_file')->store('cvs/'.$user->id, 'app');

        $application = Application::create([
            'user_id' => $user->id,
            'job_id' => $validated['job_id'],
            'full_name' => $validated['full_name'],
            'email' => $validated['email'],
            'phone' => $validated['phone'] ?? null,
            'cover_note' => $validated['cover_note'] ?? null,
            'cv_path' => $cvPath,
            'status' => 'queued',
            'submitted_at' => now(),
        ]);

        SendApplicationEmailJob::dispatch($application->id)->onQueue('default');

        return response()->json([
            'message' => 'Application submitted and queued for delivery.',
            'data' => $application,
        ], 201);
    }
}
