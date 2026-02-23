<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmailLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'application_id',
        'user_id',
        'to_email',
        'subject',
        'status',
        'error_message',
        'provider_message_id',
        'sent_at',
        'response_payload',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'response_payload' => 'array',
        ];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class, 'application_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
