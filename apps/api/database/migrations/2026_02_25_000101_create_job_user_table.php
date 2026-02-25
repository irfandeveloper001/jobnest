<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_user', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('job_id')->constrained('jobs')->cascadeOnDelete();
            $table->boolean('saved')->default(false);
            $table->boolean('hidden')->default(false)->index();
            $table->timestamps();

            $table->unique(['user_id', 'job_id']);
            $table->index(['user_id', 'hidden']);
            $table->index(['job_id', 'hidden']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_user');
    }
};
