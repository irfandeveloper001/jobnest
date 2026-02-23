<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InboxThread extends Model
{
    use HasFactory;

    protected $fillable = [
        'source_id',
        'external_thread_id',
        'from_name',
        'from_email',
        'subject',
        'preview',
        'classification',
        'status',
        'is_read',
        'last_message_at',
        'raw_payload',
    ];

    protected function casts(): array
    {
        return [
            'is_read' => 'boolean',
            'last_message_at' => 'datetime',
            'raw_payload' => 'array',
        ];
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(JobSource::class, 'source_id');
    }
}
