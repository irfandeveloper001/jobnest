<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreApplicationNoteRequest;
use App\Http\Requests\StoreApplicationStageRequest;
use App\Jobs\SendApplicationEmailJob;
use App\Models\Application;
use App\Models\ApplicationEvent;
use App\Models\ApplicationStage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApplicationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'stage' => ['nullable', 'string', 'max:32'],
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

        if (! empty($validated['stage']) && $validated['stage'] !== 'all') {
            $stageKey = $validated['stage'];
            $stageExists = ApplicationStage::query()->where('key', $stageKey)->exists();
            if (! $stageExists) {
                return response()->json([
                    'message' => 'The selected stage is invalid.',
                    'errors' => [
                        'stage' => ['The selected stage is invalid.'],
                    ],
                ], 422);
            }

            $query->where('stage_key', $stageKey);
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

        $stages = ApplicationStage::query()
            ->orderBy('sort_order')
            ->get(['key', 'label'])
            ->mapWithKeys(fn (ApplicationStage $stage) => [$stage->key => $stage->label])
            ->all();

        $applications = $paginator->getCollection()->map(function (Application $application) use ($stages): array {
            $publicStatus = $this->toPublicStatus($application);
            $lastActivity = $this->buildLastActivity($application, $publicStatus);
            $stageKey = $application->stage_key ?: 'saved';

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
                'stage' => [
                    'key' => $stageKey,
                    'label' => $stages[$stageKey] ?? ucfirst($stageKey),
                ],
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
            'stages' => ApplicationStage::query()
                ->orderBy('sort_order')
                ->get(['key', 'label', 'sort_order']),
        ]);
    }

    public function show(Request $request, Application $application): JsonResponse
    {
        $this->assertAccessibleBy($request, $application);

        $application->load([
            'job:id,title,company_name,location,status',
            'emailLogs:id,application_id,status,sent_at,created_at',
            'events' => fn ($query) => $query->orderByDesc('created_at'),
            'followups' => fn ($query) => $query->orderBy('due_at'),
        ]);

        $publicStatus = $this->toPublicStatus($application);
        $availableStages = ApplicationStage::query()
            ->orderBy('sort_order')
            ->get(['key', 'label', 'sort_order']);
        $stageLabel = $availableStages->firstWhere('key', $application->stage_key)?->label ?? ucfirst((string) $application->stage_key);

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
                'stage' => [
                    'key' => $application->stage_key ?: 'saved',
                    'label' => $stageLabel,
                ],
                'created_at' => optional($application->created_at)->toISOString(),
                'submitted_at' => optional($application->submitted_at)->toISOString(),
                'emailed_at' => optional($application->emailed_at)->toISOString(),
                'last_activity' => $this->buildLastActivity($application, $publicStatus),
                'events' => $application->events->map(function (ApplicationEvent $event): array {
                    return [
                        'id' => $event->id,
                        'type' => $event->type,
                        'payload' => $event->payload ?? [],
                        'created_at' => optional($event->created_at)->toISOString(),
                    ];
                })->values(),
                'followups' => $application->followups->map(function ($followup): array {
                    return [
                        'id' => $followup->id,
                        'status' => $followup->status,
                        'due_at' => optional($followup->due_at)->toISOString(),
                        'note' => $followup->note,
                    ];
                })->values(),
                'available_stages' => $availableStages,
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
            'stage_key' => 'applied',
            'submitted_at' => now(),
        ]);

        ApplicationEvent::create([
            'application_id' => $application->id,
            'type' => 'stage_change',
            'payload' => [
                'from' => 'saved',
                'to' => 'applied',
                'changed_by' => $user->id,
            ],
        ]);

        SendApplicationEmailJob::dispatch($application->id)->onQueue('default');

        return response()->json([
            'message' => 'Application submitted and queued for delivery.',
            'data' => $application,
        ], 201);
    }

    public function updateStage(StoreApplicationStageRequest $request, Application $application): JsonResponse
    {
        $this->assertAccessibleBy($request, $application);
        $user = $request->user();
        $nextStage = $request->validated('stage_key');
        $previousStage = $application->stage_key ?: 'saved';

        if ($nextStage !== $previousStage) {
            $application->update(['stage_key' => $nextStage]);

            ApplicationEvent::create([
                'application_id' => $application->id,
                'type' => 'stage_change',
                'payload' => [
                    'from' => $previousStage,
                    'to' => $nextStage,
                    'changed_by' => $user->id,
                ],
            ]);
        }

        return response()->json([
            'message' => 'Application stage updated.',
            'data' => [
                'application_id' => $application->id,
                'stage_key' => $application->fresh()->stage_key,
            ],
        ]);
    }

    public function addNote(StoreApplicationNoteRequest $request, Application $application): JsonResponse
    {
        $this->assertAccessibleBy($request, $application);
        $user = $request->user();

        $event = ApplicationEvent::create([
            'application_id' => $application->id,
            'type' => 'note',
            'payload' => [
                'text' => $request->validated('text'),
                'author_id' => $user->id,
                'author_name' => $user->name,
            ],
        ]);

        return response()->json([
            'message' => 'Note added.',
            'data' => [
                'id' => $event->id,
                'type' => $event->type,
                'payload' => $event->payload ?? [],
                'created_at' => optional($event->created_at)->toISOString(),
            ],
        ], 201);
    }

    private function assertAccessibleBy(Request $request, Application $application): void
    {
        $user = $request->user();
        if ($user->role !== 'admin' && $application->user_id !== $user->id) {
            abort(404);
        }
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
                return 'Email sent';
            }
            if ($latestLog->status === 'failed') {
                return 'Email delivery failed';
            }
            return 'Email queued';
        }

        return match ($publicStatus) {
            'replied' => 'Reply received',
            'emailed' => 'Email sent',
            default => 'Application submitted',
        };
    }
}
