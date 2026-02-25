<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Country extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
        'iso2',
        'iso3',
        'phonecode',
        'emoji',
    ];

    public function states(): HasMany
    {
        return $this->hasMany(LocationState::class, 'country_id');
    }
}
