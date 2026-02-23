<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InboxThread;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $threads = InboxThread::query()
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->paginate(
                $validated['per_page'] ?? 20,
                ['*'],
                'page',
                $validated['page'] ?? 1,
            );

        return response()->json($threads);
    }
}
