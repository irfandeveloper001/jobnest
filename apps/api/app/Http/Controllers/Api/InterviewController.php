<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Application;
use App\Models\Interview;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class InterviewController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'in:all,upcoming,completed,cancelled,rescheduled'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $userId = $request->user()->id;
        $query = Interview::query()
            ->where('user_id', $userId)
            ->with(['job:id,title,company_name', 'application:id,full_name,email']);

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->where(function (Builder $inner) use ($q): void {
                $inner->where('company', 'like', "%{$q}%")
                    ->orWhere('role_title', 'like', "%{$q}%");
            });
        }

        if (! empty($validated['status']) && $validated['status'] !== 'all') {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['from'])) {
            $query->whereDate('scheduled_at', '>=', $validated['from']);
        }

        if (! empty($validated['to'])) {
            $query->whereDate('scheduled_at', '<=', $validated['to']);
        }

        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 10);
        $paginator = $query
            ->orderBy('scheduled_at')
            ->orderByDesc('id')
            ->paginate($perPage, ['*'], 'page', $page);

        $data = $paginator->getCollection()
            ->map(fn (Interview $interview): array => $this->serializeInterview($interview))
            ->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company' => ['required', 'string', 'max:255'],
            'role_title' => ['required', 'string', 'max:255'],
            'interview_type' => ['required', 'in:phone,technical,onsite,hr,final,other'],
            'scheduled_at' => ['required', 'date'],
            'timezone' => ['required', 'string', 'max:100'],
            'location' => ['nullable', 'string', 'max:255'],
            'meeting_link' => ['nullable', 'string', 'max:2000'],
            'interviewer_name' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'application_id' => ['nullable', 'integer', 'exists:applications,id'],
            'job_id' => ['nullable', 'integer', 'exists:jobs,id'],
            'status' => ['nullable', 'in:upcoming,completed,cancelled,rescheduled'],
        ]);

        $user = $request->user();
        $this->assertApplicationOwnership($validated['application_id'] ?? null, $user->id);

        $interview = Interview::create([
            ...$validated,
            'user_id' => $user->id,
            'status' => $validated['status'] ?? 'upcoming',
        ]);

        $interview->load(['job:id,title,company_name', 'application:id,full_name,email']);

        return response()->json([
            'message' => 'Interview scheduled.',
            'data' => $this->serializeInterview($interview),
        ], 201);
    }

    public function update(Request $request, Interview $interview): JsonResponse
    {
        $this->authorizeInterview($request, $interview);

        $validated = $request->validate([
            'company' => ['nullable', 'string', 'max:255'],
            'role_title' => ['nullable', 'string', 'max:255'],
            'interview_type' => ['nullable', 'in:phone,technical,onsite,hr,final,other'],
            'scheduled_at' => ['nullable', 'date'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'location' => ['nullable', 'string', 'max:255'],
            'meeting_link' => ['nullable', 'string', 'max:2000'],
            'interviewer_name' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'application_id' => ['nullable', 'integer', 'exists:applications,id'],
            'job_id' => ['nullable', 'integer', 'exists:jobs,id'],
            'status' => ['nullable', 'in:upcoming,completed,cancelled,rescheduled'],
        ]);

        if (array_key_exists('application_id', $validated)) {
            $this->assertApplicationOwnership($validated['application_id'], $request->user()->id);
        }

        $interview->fill($validated);
        $interview->save();
        $interview->load(['job:id,title,company_name', 'application:id,full_name,email']);

        return response()->json([
            'message' => 'Interview updated.',
            'data' => $this->serializeInterview($interview),
        ]);
    }

    public function destroy(Request $request, Interview $interview): JsonResponse
    {
        $this->authorizeInterview($request, $interview);

        $interview->delete();

        return response()->json([
            'message' => 'Interview deleted.',
        ]);
    }

    private function authorizeInterview(Request $request, Interview $interview): void
    {
        if ($interview->user_id !== $request->user()->id) {
            abort(404);
        }
    }

    private function assertApplicationOwnership(?int $applicationId, int $userId): void
    {
        if (! $applicationId) {
            return;
        }

        $isOwned = Application::query()
            ->where('id', $applicationId)
            ->where('user_id', $userId)
            ->exists();

        if (! $isOwned) {
            throw ValidationException::withMessages([
                'application_id' => 'The selected application is invalid for this user.',
            ]);
        }
    }

    private function serializeInterview(Interview $interview): array
    {
        return [
            'id' => $interview->id,
            'application_id' => $interview->application_id,
            'job_id' => $interview->job_id,
            'company' => $interview->company,
            'role_title' => $interview->role_title,
            'interview_type' => $interview->interview_type,
            'scheduled_at' => optional($interview->scheduled_at)->toISOString(),
            'timezone' => $interview->timezone,
            'location' => $interview->location,
            'meeting_link' => $interview->meeting_link,
            'interviewer_name' => $interview->interviewer_name,
            'notes' => $interview->notes,
            'status' => $interview->status,
            'created_at' => optional($interview->created_at)->toISOString(),
            'job' => $interview->job ? [
                'id' => $interview->job->id,
                'title' => $interview->job->title,
                'company' => $interview->job->company_name,
            ] : null,
            'application' => $interview->application ? [
                'id' => $interview->application->id,
                'full_name' => $interview->application->full_name,
                'email' => $interview->application->email,
            ] : null,
        ];
    }
}
