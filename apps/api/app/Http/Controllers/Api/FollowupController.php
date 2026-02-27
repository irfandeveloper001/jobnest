<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFollowupRequest;
use App\Http\Requests\UpdateFollowupRequest;
use App\Models\Application;
use App\Models\ApplicationEvent;
use App\Models\Followup;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FollowupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'in:all,pending,done,snoozed'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $user = $request->user();
        $query = Followup::query()
            ->with(['application.job:id,title,company_name'])
            ->where('user_id', $user->id);

        if (! empty($validated['status']) && $validated['status'] !== 'all') {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->whereHas('application', function (Builder $inner) use ($q): void {
                $inner->where('full_name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhereHas('job', function (Builder $jobQuery) use ($q): void {
                        $jobQuery->where('title', 'like', "%{$q}%")
                            ->orWhere('company_name', 'like', "%{$q}%");
                    });
            });
        }

        $perPage = (int) ($validated['per_page'] ?? 10);
        $page = (int) ($validated['page'] ?? 1);

        $paginator = $query
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 WHEN status = 'snoozed' THEN 1 ELSE 2 END")
            ->orderBy('due_at')
            ->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => $paginator->getCollection()->map(function (Followup $followup): array {
                return [
                    'id' => $followup->id,
                    'application_id' => $followup->application_id,
                    'status' => $followup->status,
                    'due_at' => optional($followup->due_at)->toISOString(),
                    'note' => $followup->note,
                    'application' => [
                        'id' => $followup->application?->id,
                        'full_name' => $followup->application?->full_name,
                        'email' => $followup->application?->email,
                        'job' => [
                            'id' => $followup->application?->job?->id,
                            'title' => $followup->application?->job?->title,
                            'company' => $followup->application?->job?->company_name,
                        ],
                    ],
                    'created_at' => optional($followup->created_at)->toISOString(),
                ];
            })->values(),
            'meta' => [
                'page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(StoreFollowupRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        $application = Application::query()->findOrFail($validated['application_id']);
        if ($user->role !== 'admin' && $application->user_id !== $user->id) {
            abort(404);
        }

        $followup = Followup::create([
            'application_id' => $application->id,
            'user_id' => $user->id,
            'due_at' => $validated['due_at'],
            'status' => 'pending',
            'note' => $validated['note'] ?? null,
        ]);

        ApplicationEvent::create([
            'application_id' => $application->id,
            'type' => 'followup',
            'payload' => [
                'followup_id' => $followup->id,
                'status' => $followup->status,
                'due_at' => optional($followup->due_at)->toISOString(),
                'note' => $followup->note,
            ],
        ]);

        return response()->json([
            'message' => 'Follow-up created.',
            'data' => [
                'id' => $followup->id,
                'application_id' => $followup->application_id,
                'status' => $followup->status,
                'due_at' => optional($followup->due_at)->toISOString(),
                'note' => $followup->note,
            ],
        ], 201);
    }

    public function update(UpdateFollowupRequest $request, Followup $followup): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin' && $followup->user_id !== $user->id) {
            abort(404);
        }

        $followup->fill($request->validated());
        $followup->save();

        ApplicationEvent::create([
            'application_id' => $followup->application_id,
            'type' => 'followup',
            'payload' => [
                'followup_id' => $followup->id,
                'status' => $followup->status,
                'due_at' => optional($followup->due_at)->toISOString(),
                'note' => $followup->note,
            ],
        ]);

        return response()->json([
            'message' => 'Follow-up updated.',
            'data' => [
                'id' => $followup->id,
                'application_id' => $followup->application_id,
                'status' => $followup->status,
                'due_at' => optional($followup->due_at)->toISOString(),
                'note' => $followup->note,
            ],
        ]);
    }
}

