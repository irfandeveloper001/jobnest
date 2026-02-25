<?php

use App\Http\Controllers\Api\Admin\EmailLogAdminController;
use App\Http\Controllers\Api\Admin\JobSourceAdminController;
use App\Http\Controllers\Api\Admin\SyncLogAdminController;
use App\Http\Controllers\Api\Admin\UserAdminController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\ApplicationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InboxController;
use App\Http\Controllers\Api\InterviewController;
use App\Http\Controllers\Api\JobController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\MetricsController;
use App\Http\Controllers\Api\ProfileController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/jobs', [JobController::class, 'index']);
    Route::post('/jobs/import', [JobController::class, 'import']);
    Route::post('/jobs/sync-now', [JobController::class, 'syncNow']);
    Route::get('/jobs/{job}', [JobController::class, 'show']);
    Route::patch('/jobs/{job}/status', [JobController::class, 'updateStatus']);

    Route::get('/profile', [ProfileController::class, 'show']);
    Route::post('/profile', [ProfileController::class, 'store']);
    Route::post('/profile/cv', [ProfileController::class, 'uploadCv']);
    Route::get('/profile/cv', [ProfileController::class, 'cv']);
    Route::delete('/profile/cv', [ProfileController::class, 'deleteCv']);
    Route::get('/locations/countries', [LocationController::class, 'countries']);
    Route::get('/locations/states', [LocationController::class, 'states']);
    Route::get('/locations/cities', [LocationController::class, 'cities']);

    Route::get('/applications', [ApplicationController::class, 'index']);
    Route::post('/applications', [ApplicationController::class, 'store']);
    Route::get('/applications/{application}', [ApplicationController::class, 'show']);

    Route::get('/inbox/threads', [InboxController::class, 'index']);
    Route::get('/inbox/threads/{id}', [InboxController::class, 'show']);
    Route::post('/inbox/threads/{id}/reply', [InboxController::class, 'reply']);
    Route::patch('/inbox/threads/{id}', [InboxController::class, 'update']);
    Route::get('/analytics/overview', [AnalyticsController::class, 'overview']);
    Route::get('/interviews', [InterviewController::class, 'index']);
    Route::post('/interviews', [InterviewController::class, 'store']);
    Route::patch('/interviews/{interview}', [InterviewController::class, 'update']);
    Route::delete('/interviews/{interview}', [InterviewController::class, 'destroy']);
    Route::get('/metrics', [MetricsController::class, 'index']);

    Route::prefix('admin')->middleware('admin')->group(function (): void {
        Route::get('/users', [UserAdminController::class, 'index']);
        Route::get('/sync-logs', [SyncLogAdminController::class, 'index']);
        Route::get('/email-logs', [EmailLogAdminController::class, 'index']);
        Route::get('/job-sources', [JobSourceAdminController::class, 'index']);
        Route::patch('/job-sources/{jobSource}', [JobSourceAdminController::class, 'update']);
    });
});
