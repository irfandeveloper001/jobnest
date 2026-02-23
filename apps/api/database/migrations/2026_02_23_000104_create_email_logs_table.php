<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('application_id')->nullable()->constrained('applications')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('to_email')->index();
            $table->string('subject');
            $table->enum('status', ['queued', 'sent', 'failed'])->default('queued')->index();
            $table->text('error_message')->nullable();
            $table->string('provider_message_id')->nullable()->index();
            $table->timestamp('sent_at')->nullable()->index();
            $table->json('response_payload')->nullable();
            $table->timestamps();

            $table->index(['application_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
    }
};
