<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobSource extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'name',
        'base_url',
        'enabled',
        'sync_interval_minutes',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'last_synced_at' => 'datetime',
        ];
    }

    public function jobs(): HasMany
    {
        return $this->hasMany(Job::class, 'source_id');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(JobRecipient::class, 'source_id');
    }

    public function syncLogs(): HasMany
    {
        return $this->hasMany(SyncLog::class, 'source_id');
    }

    public function inboxThreads(): HasMany
    {
        return $this->hasMany(InboxThread::class, 'source_id');
    }
}
