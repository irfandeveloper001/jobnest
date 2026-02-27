<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Application extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'job_id',
        'full_name',
        'email',
        'phone',
        'cover_note',
        'cv_path',
        'status',
        'stage_key',
        'submitted_at',
        'emailed_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'emailed_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function job(): BelongsTo
    {
        return $this->belongsTo(Job::class, 'job_id');
    }

    public function emailLogs(): HasMany
    {
        return $this->hasMany(EmailLog::class, 'application_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(ApplicationEvent::class, 'application_id');
    }

    public function followups(): HasMany
    {
        return $this->hasMany(Followup::class, 'application_id');
    }
}
