<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'preferred_country_id')) {
                $table->unsignedBigInteger('preferred_country_id')->nullable()->index();
            }

            if (! Schema::hasColumn('users', 'preferred_state_id')) {
                $table->unsignedBigInteger('preferred_state_id')->nullable()->index();
            }

            if (! Schema::hasColumn('users', 'preferred_city_id')) {
                $table->unsignedBigInteger('preferred_city_id')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'preferred_city_id')) {
                $table->dropColumn('preferred_city_id');
            }

            if (Schema::hasColumn('users', 'preferred_state_id')) {
                $table->dropColumn('preferred_state_id');
            }

            if (Schema::hasColumn('users', 'preferred_country_id')) {
                $table->dropColumn('preferred_country_id');
            }
        });
    }
};
