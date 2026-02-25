<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'phone')) {
                $table->string('phone')->nullable()->after('role');
            }
            if (! Schema::hasColumn('users', 'preferred_keywords')) {
                $table->json('preferred_keywords')->nullable()->after('phone');
            }
            if (! Schema::hasColumn('users', 'preferred_location')) {
                $table->string('preferred_location')->nullable()->after('preferred_keywords');
            }
            if (! Schema::hasColumn('users', 'preferred_job_type')) {
                $table->string('preferred_job_type')->nullable()->after('preferred_location');
            }
            if (! Schema::hasColumn('users', 'cv_path')) {
                $table->text('cv_path')->nullable()->after('preferred_job_type');
            }
            if (! Schema::hasColumn('users', 'cv_uploaded_at')) {
                $table->timestamp('cv_uploaded_at')->nullable()->after('cv_path');
            }
            if (! Schema::hasColumn('users', 'profile_completed_at')) {
                $table->timestamp('profile_completed_at')->nullable()->after('cv_uploaded_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'profile_completed_at')) {
                $table->dropColumn('profile_completed_at');
            }
            if (Schema::hasColumn('users', 'cv_uploaded_at')) {
                $table->dropColumn('cv_uploaded_at');
            }
            if (Schema::hasColumn('users', 'cv_path')) {
                $table->dropColumn('cv_path');
            }
            if (Schema::hasColumn('users', 'preferred_job_type')) {
                $table->dropColumn('preferred_job_type');
            }
            if (Schema::hasColumn('users', 'preferred_location')) {
                $table->dropColumn('preferred_location');
            }
            if (Schema::hasColumn('users', 'preferred_keywords')) {
                $table->dropColumn('preferred_keywords');
            }
            if (Schema::hasColumn('users', 'phone')) {
                $table->dropColumn('phone');
            }
        });
    }
};
