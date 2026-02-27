<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ImportJobsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'keyword' => ['nullable', 'string', 'max:120'],
            'source' => ['nullable', 'in:arbeitnow,remotive,jsearch,all'],
            'only_new' => ['nullable', 'boolean'],
            'country' => ['nullable', 'string', 'size:2'],
            'remote' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1', 'max:10'],
            'num_pages' => ['nullable', 'integer', 'min:1', 'max:10'],
            'date_posted' => ['nullable', 'in:today,3days,week,month'],
            'employment_types' => ['nullable', 'string', 'max:120'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('country')) {
            $this->merge([
                'country' => strtolower(trim((string) $this->input('country'))),
            ]);
        }
    }
}
