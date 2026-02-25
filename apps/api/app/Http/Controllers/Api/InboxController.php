<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendInboxReplyEmailJob;
use App\Models\InboxMessage;
use App\Models\InboxThread;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'label' => ['nullable', 'in:all,inbox,starred,sent,drafts'],
            'filter' => ['nullable', 'in:all,positive,negative,neutral'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $userId = $request->user()->id;
        $query = InboxThread::query()->where('user_id', $userId);

        if (! empty($validated['q'])) {
            $needle = trim($validated['q']);
            $query->where(function (Builder $inner) use ($needle): void {
                $inner->where('from_email', 'like', "%{$needle}%")
                    ->orWhere('subject', 'like', "%{$needle}%")
                    ->orWhere('snippet', 'like', "%{$needle}%")
                    ->orWhere('preview', 'like', "%{$needle}%");
            });
        }

        $label = $validated['label'] ?? 'all';
        if ($label !== 'all') {
            $query->where('label', $label);
        }

        $filter = $validated['filter'] ?? 'all';
        if ($filter !== 'all') {
            $query->whereIn('classification', $this->classificationFilterValues($filter));
        }

        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 10);

        $threads = $query
            ->orderByDesc('last_message_at')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->paginate($perPage, ['*'], 'page', $page);

        $data = $threads->getCollection()
            ->map(fn (InboxThread $thread): array => $this->serializeThread($thread, $request->user()->email))
            ->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'page' => $threads->currentPage(),
                'per_page' => $threads->perPage(),
                'total' => $threads->total(),
                'last_page' => $threads->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $thread = InboxThread::query()
            ->where('user_id', $user->id)
            ->findOrFail($id);

        $messages = InboxMessage::query()
            ->where('user_id', $user->id)
            ->where('thread_id', $thread->id)
            ->orderByRaw('COALESCE(sent_at, created_at) asc')
            ->orderBy('id')
            ->get();

        $serializedMessages = $messages->map(function (InboxMessage $message): array {
            $time = $message->sent_at ?: $message->created_at;
            return [
                'id' => $message->id,
                'direction' => $message->direction,
                'body' => $message->body,
                'time_label' => $this->formatTimeLabel($time),
                'from_email' => $message->from_email,
                'to_email' => $message->to_email,
            ];
        })->values();

        if ($serializedMessages->isEmpty()) {
            $serializedMessages = collect([
                [
                    'id' => 'fallback-'.$thread->id,
                    'direction' => 'in',
                    'body' => $thread->snippet ?: ($thread->preview ?: 'No messages yet.'),
                    'time_label' => $this->formatTimeLabel($thread->last_message_at),
                    'from_email' => $thread->from_email,
                    'to_email' => $thread->to_email ?: $user->email,
                ],
            ]);
        }

        return response()->json([
            'thread' => [
                'id' => $thread->id,
                'from_name' => $thread->from_name,
                'from_email' => $thread->from_email,
                'subject' => $thread->subject,
                'classification' => $this->normalizeClassification($thread->classification),
                'label' => $thread->label ?: 'inbox',
                'to_email' => $thread->to_email ?: $user->email,
                'last_time_label' => $this->formatLastTimeLabel($thread->last_message_at),
            ],
            'messages' => $serializedMessages,
            'suggested_followup' => $this->buildSuggestedFollowup($thread->classification),
        ]);
    }

    public function reply(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'body' => ['required', 'string', 'max:10000'],
            'label' => ['nullable', 'in:inbox,starred,sent,drafts'],
        ]);

        $user = $request->user();
        $thread = InboxThread::query()
            ->where('user_id', $user->id)
            ->findOrFail($id);

        $label = $validated['label'] ?? $thread->label ?? 'inbox';
        $isDraft = $label === 'drafts';
        $sentAt = $isDraft ? null : now();
        $subject = $thread->subject ? 'Re: '.$thread->subject : 'JobNest Follow-up';
        $recipientEmail = $thread->from_email ?: ($thread->to_email ?: $user->email);

        $message = InboxMessage::query()->create([
            'user_id' => $user->id,
            'thread_id' => $thread->id,
            'direction' => 'out',
            'from_email' => $user->email,
            'to_email' => $recipientEmail,
            'subject' => $subject,
            'body' => $validated['body'],
            'sent_at' => $sentAt,
        ]);

        $thread->update([
            'to_email' => $user->email,
            'snippet' => mb_substr(trim($validated['body']), 0, 280),
            'last_message_at' => now(),
            'label' => $isDraft ? 'drafts' : 'sent',
        ]);

        if (! $isDraft) {
            SendInboxReplyEmailJob::dispatch($message->id)->onQueue('default');
        }

        return response()->json([
            'ok' => true,
            'draft' => $isDraft,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'label' => ['nullable', 'in:inbox,starred,sent,drafts'],
            'classification' => ['nullable', 'in:positive,neutral,negative'],
            'starred' => ['nullable', 'boolean'],
        ]);

        $thread = InboxThread::query()
            ->where('user_id', $request->user()->id)
            ->findOrFail($id);

        $updates = [];
        if (array_key_exists('starred', $validated)) {
            if ($validated['starred']) {
                $updates['label'] = 'starred';
            } elseif (($thread->label ?? 'inbox') === 'starred') {
                $updates['label'] = 'inbox';
            }
        }
        if (! empty($validated['label'])) {
            $updates['label'] = $validated['label'];
        }
        if (! empty($validated['classification'])) {
            $updates['classification'] = $validated['classification'];
        }

        if (! empty($updates)) {
            $thread->update($updates);
            $thread->refresh();
        }

        return response()->json([
            'data' => $this->serializeThread($thread, $request->user()->email),
        ]);
    }

    private function serializeThread(InboxThread $thread, ?string $defaultToEmail): array
    {
        return [
            'id' => $thread->id,
            'from_name' => $thread->from_name,
            'from_email' => $thread->from_email,
            'subject' => $thread->subject,
            'snippet' => $thread->snippet ?: ($thread->preview ?: ''),
            'classification' => $this->normalizeClassification($thread->classification),
            'label' => $thread->label ?: 'inbox',
            'to_email' => $thread->to_email ?: $defaultToEmail,
            'last_time_label' => $this->formatLastTimeLabel($thread->last_message_at),
            'last_message_at' => optional($thread->last_message_at)->toISOString(),
        ];
    }

    private function normalizeClassification(?string $classification): string
    {
        $value = strtolower((string) $classification);
        if (in_array($value, ['positive', 'offer', 'interview', 'application'], true)) {
            return 'positive';
        }
        if (in_array($value, ['negative', 'rejection'], true)) {
            return 'negative';
        }
        return 'neutral';
    }

    private function classificationFilterValues(string $filter): array
    {
        return match ($filter) {
            'positive' => ['positive', 'offer', 'interview', 'application'],
            'negative' => ['negative', 'rejection'],
            'neutral' => ['neutral', 'unknown', 'other'],
            default => ['positive', 'neutral', 'negative', 'offer', 'interview', 'application', 'rejection', 'unknown', 'other'],
        };
    }

    private function formatLastTimeLabel($value): string
    {
        if (! $value) {
            return 'Just now';
        }

        $date = $value instanceof Carbon ? $value : Carbon::parse($value);
        if ($date->isToday()) {
            return 'Today '.$date->format('g:i A');
        }
        if ($date->isYesterday()) {
            return 'Yesterday '.$date->format('g:i A');
        }

        return $date->format('M j, g:i A');
    }

    private function formatTimeLabel($value): string
    {
        if (! $value) {
            return 'Just now';
        }

        $date = $value instanceof Carbon ? $value : Carbon::parse($value);
        return $date->format('M j, g:i A');
    }

    private function buildSuggestedFollowup(?string $classification): ?array
    {
        return match ($this->normalizeClassification($classification)) {
            'positive' => ['text' => 'Thanks for the update. Happy to confirm my availability and next steps this week.'],
            'negative' => ['text' => 'Thank you for the response. I appreciate your time and would value any brief feedback.'],
            default => ['text' => 'Thanks for reaching out. I would be glad to discuss this opportunity in more detail.'],
        };
    }
}
