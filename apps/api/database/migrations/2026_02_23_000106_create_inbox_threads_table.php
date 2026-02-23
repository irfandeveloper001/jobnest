<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inbox_threads', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('source_id')->nullable()->constrained('job_sources')->nullOnDelete();
            $table->string('external_thread_id')->unique();
            $table->string('from_name')->nullable();
            $table->string('from_email')->nullable()->index();
            $table->string('subject')->nullable();
            $table->text('preview')->nullable();
            $table->enum('classification', ['unknown', 'application', 'interview', 'rejection', 'offer', 'other'])->default('unknown')->index();
            $table->enum('status', ['open', 'closed'])->default('open')->index();
            $table->boolean('is_read')->default(false)->index();
            $table->timestamp('last_message_at')->nullable()->index();
            $table->json('raw_payload')->nullable();
            $table->timestamps();

            $table->index(['classification', 'last_message_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inbox_threads');
    }
};
