<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateFollowupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['sometimes', 'in:pending,done,snoozed'],
            'due_at' => ['sometimes', 'date'],
            'note' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }
}

