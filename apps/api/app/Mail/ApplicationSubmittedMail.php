<?php

namespace App\Mail;

use App\Models\Application;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class ApplicationSubmittedMail extends Mailable
{
    use Queueable;

    public function __construct(
        public Application $application,
        public string $cvAbsolutePath,
    ) {
        //
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'New Job Application: '.$this->application->job->title,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.application-submitted',
            with: [
                'application' => $this->application,
                'job' => $this->application->job,
                'user' => $this->application->user,
            ],
        );
    }

    public function attachments(): array
    {
        return [
            Attachment::fromPath($this->cvAbsolutePath)
                ->as('cv-application-'.$this->application->id.'.'.pathinfo($this->cvAbsolutePath, PATHINFO_EXTENSION)),
        ];
    }
}
