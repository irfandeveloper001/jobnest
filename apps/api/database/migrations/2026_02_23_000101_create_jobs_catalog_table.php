<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('jobs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('source_id')->constrained('job_sources')->cascadeOnDelete();
            $table->string('external_id', 191);
            $table->string('title');
            $table->string('company_name')->nullable();
            $table->string('location')->nullable()->index();
            $table->enum('remote_type', ['remote', 'hybrid', 'onsite', 'unknown'])->default('unknown')->index();
            $table->enum('employment_type', ['full_time', 'part_time', 'contract', 'internship', 'freelance', 'temporary', 'unknown'])->default('unknown')->index();
            $table->enum('status', ['new', 'saved', 'applied', 'ignored', 'archived'])->default('new')->index();
            $table->string('url')->nullable();
            $table->decimal('salary_min', 12, 2)->nullable();
            $table->decimal('salary_max', 12, 2)->nullable();
            $table->string('salary_currency', 10)->nullable();
            $table->longText('description')->nullable();
            $table->timestamp('posted_at')->nullable()->index();
            $table->json('raw_payload')->nullable();
            $table->timestamps();

            $table->unique(['source_id', 'external_id']);
            $table->index(['source_id', 'status']);
            $table->index(['source_id', 'posted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('jobs');
    }
};
