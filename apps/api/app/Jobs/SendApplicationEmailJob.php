<?php

namespace App\Jobs;

use App\Mail\ApplicationSubmittedMail;
use App\Models\Application;
use App\Models\EmailLog;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Throwable;

class SendApplicationEmailJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(public int $applicationId)
    {
        //
    }

    public function handle(): void
    {
        $application = Application::query()
            ->with(['job.source', 'job.recipients'])
            ->findOrFail($this->applicationId);

        $job = $application->job;
        $cvAbsolutePath = Storage::disk('app')->path($application->cv_path);

        $recipientEmails = $job->recipients()
            ->where('is_active', true)
            ->pluck('email')
            ->filter()
            ->unique()
            ->values();

        if ($recipientEmails->isEmpty()) {
            $recipientEmails = collect([$application->email]);
        }

        foreach ($recipientEmails as $email) {
            $log = EmailLog::create([
                'application_id' => $application->id,
                'user_id' => $application->user_id,
                'to_email' => $email,
                'subject' => 'New Job Application: '.$job->title,
                'status' => 'queued',
            ]);

            try {
                Mail::to($email)->send(new ApplicationSubmittedMail($application, $cvAbsolutePath));

                $log->update([
                    'status' => 'sent',
                    'sent_at' => now(),
                ]);
            } catch (Throwable $exception) {
                $log->update([
                    'status' => 'failed',
                    'error_message' => $exception->getMessage(),
                ]);

                $application->update([
                    'status' => 'failed',
                ]);

                throw $exception;
            }
        }

        $application->update([
            'status' => 'sent',
            'emailed_at' => now(),
        ]);
    }
}
