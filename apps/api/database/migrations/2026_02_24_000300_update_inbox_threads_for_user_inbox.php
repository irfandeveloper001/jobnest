<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inbox_threads', function (Blueprint $table): void {
            if (! Schema::hasColumn('inbox_threads', 'user_id')) {
                $table->foreignId('user_id')
                    ->nullable()
                    ->after('id')
                    ->constrained('users')
                    ->nullOnDelete()
                    ->index();
            }

            if (! Schema::hasColumn('inbox_threads', 'to_email')) {
                $table->string('to_email')->nullable()->after('from_email');
            }

            if (! Schema::hasColumn('inbox_threads', 'label')) {
                $table->enum('label', ['inbox', 'starred', 'sent', 'drafts'])
                    ->default('inbox')
                    ->after('subject')
                    ->index();
            }

            if (! Schema::hasColumn('inbox_threads', 'snippet')) {
                $table->text('snippet')->nullable()->after('preview');
            }
        });

        if (Schema::hasColumn('inbox_threads', 'classification')) {
            DB::statement(
                "ALTER TABLE inbox_threads MODIFY classification ENUM('positive','neutral','negative','unknown','application','interview','rejection','offer','other') NOT NULL DEFAULT 'neutral'"
            );
        } else {
            Schema::table('inbox_threads', function (Blueprint $table): void {
                $table->enum('classification', ['positive', 'neutral', 'negative'])
                    ->default('neutral')
                    ->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('inbox_threads', 'classification')) {
            DB::statement(
                "ALTER TABLE inbox_threads MODIFY classification ENUM('unknown','application','interview','rejection','offer','other') NOT NULL DEFAULT 'unknown'"
            );
        }

        Schema::table('inbox_threads', function (Blueprint $table): void {
            if (Schema::hasColumn('inbox_threads', 'snippet')) {
                $table->dropColumn('snippet');
            }

            if (Schema::hasColumn('inbox_threads', 'label')) {
                $table->dropColumn('label');
            }

            if (Schema::hasColumn('inbox_threads', 'to_email')) {
                $table->dropColumn('to_email');
            }

            if (Schema::hasColumn('inbox_threads', 'user_id')) {
                $table->dropConstrainedForeignId('user_id');
            }
        });
    }
};
