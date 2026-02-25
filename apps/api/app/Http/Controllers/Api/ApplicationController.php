<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendApplicationEmailJob;
use App\Models\Application;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApplicationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'in:all,submitted,emailed,replied,queued,sent,failed'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $user = $request->user();
        $query = Application::query()
            ->with([
                'job:id,title,company_name',
                'emailLogs:id,application_id,status,sent_at,created_at',
            ]);

        if ($user->role !== 'admin') {
            $query->where('user_id', $user->id);
        }

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->where(function (Builder $inner) use ($q): void {
                $inner->where('full_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhereHas('job', function (Builder $jobQuery) use ($q): void {
                        $jobQuery->where('title', 'like', "%{$q}%")
                            ->orWhere('company_name', 'like', "%{$q}%");
                    });
            });
        }

        if (! empty($validated['status']) && $validated['status'] !== 'all') {
            $status = $validated['status'];

            if ($status === 'submitted') {
                $query->whereIn('status', ['queued', 'failed']);
            } elseif ($status === 'emailed') {
                $query->where('status', 'sent')->where(function (Builder $inner): void {
                    $inner->whereNull('meta->replied_at')->where(function (Builder $replyState): void {
                        $replyState->whereNull('meta->reply_received')
                            ->orWhere('meta->reply_received', false);
                    });
                });
            } elseif ($status === 'replied') {
                $query->where(function (Builder $inner): void {
                    $inner->whereNotNull('meta->replied_at')
                        ->orWhere('meta->reply_received', true);
                });
            } else {
                $query->where('status', $status);
            }
        }

        $perPage = (int) ($validated['per_page'] ?? 10);
        $page = (int) ($validated['page'] ?? 1);

        $paginator = $query
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage, ['*'], 'page', $page);

        $applications = $paginator->getCollection()->map(function (Application $application): array {
            $publicStatus = $this->toPublicStatus($application);
            $lastActivity = $this->buildLastActivity($application, $publicStatus);

            return [
                'id' => $application->id,
                'job' => [
                    'id' => $application->job?->id,
                    'title' => $application->job?->title,
                    'company' => $application->job?->company_name,
                ],
                'full_name' => $application->full_name,
                'email' => $application->email,
                'status' => $publicStatus,
                'created_at' => optional($application->created_at)->toISOString(),
                'last_activity' => $lastActivity,
            ];
        })->values();

        return response()->json([
            'data' => $applications,
            'meta' => [
                'page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, Application $application): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin' && $application->user_id !== $user->id) {
            abort(404);
        }

        $application->load(['job:id,title,company_name,location,status', 'emailLogs:id,application_id,status,sent_at,created_at']);
        $publicStatus = $this->toPublicStatus($application);

        return response()->json([
            'data' => [
                'id' => $application->id,
                'job' => [
                    'id' => $application->job?->id,
                    'title' => $application->job?->title,
                    'company' => $application->job?->company_name,
                    'location' => $application->job?->location,
                ],
                'full_name' => $application->full_name,
                'email' => $application->email,
                'phone' => $application->phone,
                'cover_note' => $application->cover_note,
                'status' => $publicStatus,
                'created_at' => optional($application->created_at)->toISOString(),
                'submitted_at' => optional($application->submitted_at)->toISOString(),
                'emailed_at' => optional($application->emailed_at)->toISOString(),
                'last_activity' => $this->buildLastActivity($application, $publicStatus),
            ],
        ]);
    }

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

    private function toPublicStatus(Application $application): string
    {
        $replyReceived = (bool) data_get($application->meta, 'reply_received', false);
        $repliedAt = data_get($application->meta, 'replied_at');
        if ($replyReceived || $repliedAt) {
            return 'replied';
        }

        if ($application->status === 'sent') {
            return 'emailed';
        }

        return 'submitted';
    }

    private function buildLastActivity(Application $application, string $publicStatus): ?string
    {
        $latestLog = $application->emailLogs
            ?->sortByDesc(function ($log) {
                return $log->sent_at ?? $log->created_at;
            })
            ->first();

        if ($latestLog) {
            if ($latestLog->status === 'sent') {
                return 'Sent email';
            }
            if ($latestLog->status === 'failed') {
                return 'Delivery failed';
            }
            return 'Queued email';
        }

        return match ($publicStatus) {
            'replied' => 'Reply received',
            'emailed' => 'Sent email',
            default => 'Submitted application',
        };
    }
}
