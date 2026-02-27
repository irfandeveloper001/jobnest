<?php

namespace App\Jobs;

use App\Mail\TemplateTestMail;
use App\Models\EmailLog;
use App\Models\EmailTemplate;
use App\Support\TemplateVariableRenderer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;
use Throwable;

class SendTemplateTestEmailJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(
        public int $templateId,
        public int $userId,
        public string $toEmail,
    ) {
        //
    }

    public function handle(): void
    {
        $template = EmailTemplate::query()->findOrFail($this->templateId);
        $context = TemplateVariableRenderer::defaultContextForUser($template->user);
        $subject = TemplateVariableRenderer::render($template->subject, $context);
        $bodyHtml = TemplateVariableRenderer::render($template->body_html, $context);

        $log = EmailLog::create([
            'application_id' => null,
            'user_id' => $this->userId,
            'to_email' => $this->toEmail,
            'subject' => $subject,
            'status' => 'queued',
            'response_payload' => [
                'kind' => 'template_test',
                'template_id' => $template->id,
                'scope' => $template->scope,
                'status' => $template->status,
            ],
        ]);

        try {
            Mail::to($this->toEmail)->send(new TemplateTestMail($subject, $bodyHtml));

            $log->update([
                'status' => 'sent',
                'sent_at' => now(),
            ]);
        } catch (Throwable $exception) {
            $log->update([
                'status' => 'failed',
                'error_message' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }
}

