<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'phone',
        'preferred_keywords',
        'preferred_location',
        'preferred_country_id',
        'preferred_state_id',
        'preferred_city_id',
        'preferred_job_type',
        'cv_path',
        'cv_uploaded_at',
        'profile_completed_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'preferred_keywords' => 'array',
            'preferred_country_id' => 'integer',
            'preferred_state_id' => 'integer',
            'preferred_city_id' => 'integer',
            'cv_uploaded_at' => 'datetime',
            'profile_completed_at' => 'datetime',
        ];
    }

    public function preferredCountry(): BelongsTo
    {
        return $this->belongsTo(Country::class, 'preferred_country_id');
    }

    public function preferredState(): BelongsTo
    {
        return $this->belongsTo(LocationState::class, 'preferred_state_id');
    }

    public function preferredCity(): BelongsTo
    {
        return $this->belongsTo(City::class, 'preferred_city_id');
    }

    public function jobs(): BelongsToMany
    {
        return $this->belongsToMany(Job::class, 'job_user')
            ->withPivot(['saved', 'hidden'])
            ->withTimestamps();
    }

    public function isProfileComplete(): bool
    {
        return ! empty($this->phone)
            && ! empty($this->preferred_country_id)
            && ! empty($this->preferred_state_id)
            && ! empty($this->preferred_city_id)
            && ! empty($this->preferred_job_type)
            && is_array($this->preferred_keywords)
            && count(array_filter($this->preferred_keywords)) > 0
            && ! empty($this->cv_path)
            && ! empty($this->profile_completed_at);
    }
}
