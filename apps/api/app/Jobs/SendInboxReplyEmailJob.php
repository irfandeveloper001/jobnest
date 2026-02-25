<?php

namespace App\Jobs;

use App\Models\InboxMessage;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

class SendInboxReplyEmailJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(public int $messageId)
    {
        //
    }

    public function handle(): void
    {
        $message = InboxMessage::query()->findOrFail($this->messageId);

        Mail::raw($message->body, function ($mail) use ($message): void {
            $mail->to($message->to_email)
                ->subject($message->subject ?: 'JobNest Follow-up');
            if ($message->from_email) {
                $mail->replyTo($message->from_email);
            }
        });
    }
}
