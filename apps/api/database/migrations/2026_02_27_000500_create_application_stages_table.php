<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_stages', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 32)->unique();
            $table->string('label', 64);
            $table->unsignedSmallInteger('sort_order')->default(0)->index();
        });

        DB::table('application_stages')->insert([
            ['key' => 'saved', 'label' => 'Saved', 'sort_order' => 1],
            ['key' => 'applied', 'label' => 'Applied', 'sort_order' => 2],
            ['key' => 'interview', 'label' => 'Interview', 'sort_order' => 3],
            ['key' => 'offer', 'label' => 'Offer', 'sort_order' => 4],
            ['key' => 'rejected', 'label' => 'Rejected', 'sort_order' => 5],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('application_stages');
    }
};

