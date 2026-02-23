<?php

use App\Http\Controllers\Api\Admin\EmailLogAdminController;
use App\Http\Controllers\Api\Admin\JobSourceAdminController;
use App\Http\Controllers\Api\Admin\SyncLogAdminController;
use App\Http\Controllers\Api\Admin\UserAdminController;
use App\Http\Controllers\Api\ApplicationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InboxController;
use App\Http\Controllers\Api\JobController;
use App\Http\Controllers\Api\MetricsController;
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
    Route::get('/jobs/{job}', [JobController::class, 'show']);
    Route::patch('/jobs/{job}/status', [JobController::class, 'updateStatus']);

    Route::post('/applications', [ApplicationController::class, 'store']);

    Route::get('/inbox/threads', [InboxController::class, 'index']);
    Route::get('/metrics', [MetricsController::class, 'index']);

    Route::prefix('admin')->middleware('admin')->group(function (): void {
        Route::get('/users', [UserAdminController::class, 'index']);
        Route::get('/sync-logs', [SyncLogAdminController::class, 'index']);
        Route::get('/email-logs', [EmailLogAdminController::class, 'index']);
        Route::get('/job-sources', [JobSourceAdminController::class, 'index']);
        Route::patch('/job-sources/{jobSource}', [JobSourceAdminController::class, 'update']);
    });
});
