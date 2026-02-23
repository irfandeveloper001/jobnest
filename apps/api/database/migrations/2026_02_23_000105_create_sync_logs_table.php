<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('source_id')->constrained('job_sources')->cascadeOnDelete();
            $table->enum('status', ['success', 'partial', 'failed'])->default('success')->index();
            $table->timestamp('started_at')->nullable()->index();
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('runtime_ms')->nullable();
            $table->unsignedInteger('jobs_fetched')->default(0);
            $table->unsignedInteger('jobs_created')->default(0);
            $table->unsignedInteger('jobs_updated')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['source_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_logs');
    }
};
