<?php

namespace Database\Seeders;

use App\Models\InboxMessage;
use App\Models\InboxThread;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class InboxDemoSeeder extends Seeder
{
    public function run(): void
    {
        $users = User::query()->get(['id', 'name', 'email']);

        foreach ($users as $user) {
            $hasThreads = InboxThread::query()
                ->where('user_id', $user->id)
                ->exists();

            if ($hasThreads) {
                continue;
            }

            $first = $this->seedThread($user->id, $user->email, [
                'from_name' => 'Sarah Jenkins',
                'from_email' => 's.jenkins@innovate.co',
                'subject' => 'Re: Senior Frontend Engineer Application',
                'classification' => 'positive',
                'label' => 'inbox',
                'preview' => 'Thanks for sharing your profile. Are you available for a short call this week?',
                'minutes_ago' => 30,
            ]);

            $this->seedInboundMessage(
                $user->id,
                $first->id,
                's.jenkins@innovate.co',
                $user->email,
                'Re: Senior Frontend Engineer Application',
                'Thanks for sharing your profile. Are you available for a short call this week?',
                30,
            );

            $second = $this->seedThread($user->id, $user->email, [
                'from_name' => 'Maya Patel',
                'from_email' => 'maya.patel@productflow.io',
                'subject' => 'Frontend role update',
                'classification' => 'neutral',
                'label' => 'sent',
                'preview' => 'Following up on the role update I sent yesterday.',
                'minutes_ago' => 90,
            ]);

            $this->seedInboundMessage(
                $user->id,
                $second->id,
                'maya.patel@productflow.io',
                $user->email,
                'Frontend role update',
                'Thanks for your interest. We are still reviewing applications this week.',
                120,
            );

            InboxMessage::query()->create([
                'user_id' => $user->id,
                'thread_id' => $second->id,
                'direction' => 'out',
                'from_email' => $user->email,
                'to_email' => 'maya.patel@productflow.io',
                'subject' => 'Re: Frontend role update',
                'body' => 'Thanks for the update. I am available to discuss next steps anytime this week.',
                'sent_at' => Carbon::now()->subMinutes(90),
            ]);
        }
    }

    private function seedThread(int $userId, string $toEmail, array $data): InboxThread
    {
        return InboxThread::query()->create([
            'user_id' => $userId,
            'external_thread_id' => (string) Str::uuid(),
            'from_name' => $data['from_name'],
            'from_email' => $data['from_email'],
            'to_email' => $toEmail,
            'subject' => $data['subject'],
            'label' => $data['label'],
            'snippet' => $data['preview'],
            'preview' => $data['preview'],
            'classification' => $data['classification'],
            'status' => 'open',
            'is_read' => false,
            'last_message_at' => Carbon::now()->subMinutes($data['minutes_ago']),
        ]);
    }

    private function seedInboundMessage(
        int $userId,
        int $threadId,
        string $fromEmail,
        string $toEmail,
        string $subject,
        string $body,
        int $minutesAgo
    ): void {
        InboxMessage::query()->create([
            'user_id' => $userId,
            'thread_id' => $threadId,
            'direction' => 'in',
            'from_email' => $fromEmail,
            'to_email' => $toEmail,
            'subject' => $subject,
            'body' => $body,
            'sent_at' => Carbon::now()->subMinutes($minutesAgo),
        ]);
    }
}
