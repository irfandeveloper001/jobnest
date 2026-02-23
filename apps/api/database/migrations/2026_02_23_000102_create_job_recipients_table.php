<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_recipients', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('job_id')->nullable()->constrained('jobs')->nullOnDelete();
            $table->foreignId('source_id')->nullable()->constrained('job_sources')->nullOnDelete();
            $table->string('name')->nullable();
            $table->string('email')->index();
            $table->boolean('is_primary')->default(false)->index();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();

            $table->unique(['job_id', 'email']);
            $table->index(['source_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_recipients');
    }
};
