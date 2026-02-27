<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('subject', 255);
            $table->longText('body_html');
            $table->enum('scope', ['personal', 'team'])->default('personal')->index();
            $table->enum('status', ['draft', 'active'])->default('draft')->index();
            $table->timestamps();

            $table->index(['user_id', 'scope', 'status']);
            $table->index(['user_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_templates');
    }
};

