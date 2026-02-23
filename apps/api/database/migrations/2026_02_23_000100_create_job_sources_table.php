<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_sources', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 50)->unique();
            $table->string('name');
            $table->string('base_url')->nullable();
            $table->boolean('enabled')->default(true)->index();
            $table->unsignedSmallInteger('sync_interval_minutes')->default(15);
            $table->timestamp('last_synced_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_sources');
    }
};
