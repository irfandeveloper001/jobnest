<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendTemplateTestEmailJob;
use App\Models\EmailTemplate;
use App\Support\TemplateVariableRenderer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $query = EmailTemplate::query()
            ->where(function (Builder $inner) use ($user): void {
                $inner->where('user_id', $user->id)
                    ->orWhere('scope', 'team');
            });

        if (! empty($validated['q'])) {
            $q = trim($validated['q']);
            $query->where(function (Builder $inner) use ($q): void {
                $inner->where('name', 'like', "%{$q}%")
                    ->orWhere('subject', 'like', "%{$q}%")
                    ->orWhere('body_html', 'like', "%{$q}%");
            });
        }

        $templates = $query
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => $templates->map(fn (EmailTemplate $template): array => $this->toArray($template))->values(),
        ]);
    }

    public function show(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->assertReadableBy($request, $emailTemplate);

        $context = TemplateVariableRenderer::defaultContextForUser($request->user());
        $previewSubject = TemplateVariableRenderer::render($emailTemplate->subject, $context);
        $previewBodyHtml = TemplateVariableRenderer::render($emailTemplate->body_html, $context);

        return response()->json([
            'data' => $this->toArray($emailTemplate),
            'preview' => [
                'context' => $context,
                'subject' => $previewSubject,
                'body_html' => $previewBodyHtml,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'subject' => ['required', 'string', 'max:255'],
            'body_html' => ['required', 'string'],
            'scope' => ['nullable', 'in:personal,team'],
            'status' => ['nullable', 'in:draft,active'],
        ]);

        $template = EmailTemplate::create([
            'user_id' => $request->user()->id,
            'name' => $validated['name'],
            'subject' => $validated['subject'],
            'body_html' => $validated['body_html'],
            'scope' => $validated['scope'] ?? 'personal',
            'status' => $validated['status'] ?? 'draft',
        ]);

        return response()->json([
            'message' => 'Template created successfully.',
            'data' => $this->toArray($template),
        ], 201);
    }

    public function update(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->assertWritableBy($request, $emailTemplate);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'subject' => ['sometimes', 'required', 'string', 'max:255'],
            'body_html' => ['sometimes', 'required', 'string'],
            'scope' => ['sometimes', 'in:personal,team'],
            'status' => ['sometimes', 'in:draft,active'],
        ]);

        $emailTemplate->fill($validated);
        $emailTemplate->save();

        return response()->json([
            'message' => 'Template updated successfully.',
            'data' => $this->toArray($emailTemplate),
        ]);
    }

    public function sendTest(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->assertReadableBy($request, $emailTemplate);

        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        SendTemplateTestEmailJob::dispatch(
            $emailTemplate->id,
            $request->user()->id,
            $validated['email']
        )->onQueue('default');

        return response()->json([
            'message' => 'Test email queued.',
            'data' => [
                'template_id' => $emailTemplate->id,
                'email' => $validated['email'],
            ],
        ], 202);
    }

    private function assertReadableBy(Request $request, EmailTemplate $template): void
    {
        $user = $request->user();
        if ($user->role === 'admin') {
            return;
        }

        if ($template->user_id === $user->id || $template->scope === 'team') {
            return;
        }

        abort(404);
    }

    private function assertWritableBy(Request $request, EmailTemplate $template): void
    {
        $user = $request->user();
        if ($user->role === 'admin' || $template->user_id === $user->id) {
            return;
        }

        abort(404);
    }

    private function toArray(EmailTemplate $template): array
    {
        return [
            'id' => $template->id,
            'user_id' => $template->user_id,
            'name' => $template->name,
            'subject' => $template->subject,
            'body_html' => $template->body_html,
            'scope' => $template->scope,
            'status' => $template->status,
            'updated_at' => optional($template->updated_at)->toISOString(),
        ];
    }
}
