<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sync_logs', function (Blueprint $table): void {
            if (! Schema::hasColumn('sync_logs', 'user_id')) {
                $table->foreignId('user_id')->nullable()->after('source_id')->constrained('users')->nullOnDelete()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('sync_logs', function (Blueprint $table): void {
            if (Schema::hasColumn('sync_logs', 'user_id')) {
                $table->dropConstrainedForeignId('user_id');
            }
        });
    }
};
