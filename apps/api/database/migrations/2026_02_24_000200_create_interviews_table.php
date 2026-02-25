<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('application_id')->nullable()->constrained('applications')->nullOnDelete();
            $table->foreignId('job_id')->nullable()->constrained('jobs')->nullOnDelete();
            $table->string('company');
            $table->string('role_title');
            $table->enum('interview_type', ['phone', 'technical', 'onsite', 'hr', 'final', 'other'])->default('other');
            $table->dateTime('scheduled_at');
            $table->string('timezone')->default('UTC');
            $table->string('location')->nullable();
            $table->text('meeting_link')->nullable();
            $table->string('interviewer_name')->nullable();
            $table->text('notes')->nullable();
            $table->enum('status', ['upcoming', 'completed', 'cancelled', 'rescheduled'])->default('upcoming');
            $table->timestamps();

            $table->index('user_id');
            $table->index('scheduled_at');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interviews');
    }
};
