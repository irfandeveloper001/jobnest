<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InboxThread extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'source_id',
        'external_thread_id',
        'from_name',
        'from_email',
        'to_email',
        'subject',
        'label',
        'snippet',
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

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(InboxMessage::class, 'thread_id');
    }
}
