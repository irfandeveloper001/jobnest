<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('countries', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->string('iso2', 2)->nullable()->unique();
            $table->string('iso3', 3)->nullable();
            $table->string('phonecode', 20)->nullable();
            $table->string('emoji', 20)->nullable();
            $table->timestamps();

            $table->index('name');
        });

        Schema::create('states', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->unsignedBigInteger('country_id')->nullable()->index();
            $table->string('country_iso2', 2)->nullable()->index();
            $table->string('state_code', 20)->nullable()->index();
            $table->string('type', 60)->nullable();
            $table->timestamps();

            $table->index(['country_id', 'name']);
            $table->index(['country_iso2', 'name']);
        });

        Schema::create('cities', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->unsignedBigInteger('country_id')->nullable()->index();
            $table->string('country_iso2', 2)->nullable()->index();
            $table->unsignedBigInteger('state_id')->nullable()->index();
            $table->string('state_code', 20)->nullable()->index();
            $table->timestamps();

            $table->index(['state_id', 'name']);
            $table->index(['country_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cities');
        Schema::dropIfExists('states');
        Schema::dropIfExists('countries');
    }
};
