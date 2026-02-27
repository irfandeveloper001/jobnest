<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'firebase_uid')) {
                $table->string('firebase_uid')->nullable()->unique()->after('email');
            }

            if (! Schema::hasColumn('users', 'cv_storage_path')) {
                $table->text('cv_storage_path')->nullable()->after('cv_path');
            }

            if (! Schema::hasColumn('users', 'cv_filename')) {
                $table->string('cv_filename')->nullable()->after('cv_storage_path');
            }

            if (! Schema::hasColumn('users', 'cv_size_bytes')) {
                $table->unsignedBigInteger('cv_size_bytes')->nullable()->after('cv_filename');
            }

            if (! Schema::hasColumn('users', 'cv_mime_type')) {
                $table->string('cv_mime_type', 120)->nullable()->after('cv_size_bytes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'cv_mime_type')) {
                $table->dropColumn('cv_mime_type');
            }
            if (Schema::hasColumn('users', 'cv_size_bytes')) {
                $table->dropColumn('cv_size_bytes');
            }
            if (Schema::hasColumn('users', 'cv_filename')) {
                $table->dropColumn('cv_filename');
            }
            if (Schema::hasColumn('users', 'cv_storage_path')) {
                $table->dropColumn('cv_storage_path');
            }
            if (Schema::hasColumn('users', 'firebase_uid')) {
                $table->dropUnique('users_firebase_uid_unique');
                $table->dropColumn('firebase_uid');
            }
        });
    }
};

