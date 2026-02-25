<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Job extends Model
{
    use HasFactory;

    protected $fillable = [
        'source_id',
        'external_id',
        'title',
        'company_name',
        'location',
        'remote_type',
        'employment_type',
        'status',
        'url',
        'salary_min',
        'salary_max',
        'salary_currency',
        'description',
        'posted_at',
        'raw_payload',
    ];

    protected function casts(): array
    {
        return [
            'posted_at' => 'datetime',
            'raw_payload' => 'array',
        ];
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(JobSource::class, 'source_id');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(JobRecipient::class, 'job_id');
    }

    public function applications(): HasMany
    {
        return $this->hasMany(Application::class, 'job_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'job_user')
            ->withPivot(['saved', 'hidden'])
            ->withTimestamps();
    }
}
