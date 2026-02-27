<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('followups', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('application_id')->constrained('applications')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('due_at')->index();
            $table->enum('status', ['pending', 'done', 'snoozed'])->default('pending')->index();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();

            $table->index(['user_id', 'status', 'due_at']);
            $table->index(['application_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('followups');
    }
};

