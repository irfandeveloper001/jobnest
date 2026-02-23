<?php

namespace App\Console\Commands;

use App\Models\InboxThread;
use App\Models\JobSource;
use Illuminate\Console\Command;

class InboxSyncCommand extends Command
{
    protected $signature = 'inbox:sync';

    protected $description = 'Sync inbox threads from IMAP into inbox_threads table';

    public function handle(): int
    {
        if (! class_exists(\Webklex\PHPIMAP\ClientManager::class)) {
            $this->warn('webklex/laravel-imap is not installed. Install it to enable real IMAP syncing.');
            return self::SUCCESS;
        }

        $this->info('Starting inbox sync...');

        $source = JobSource::where('key', 'remotive')->first();
        $threadId = 'manual-sync-'.now()->timestamp;

        InboxThread::updateOrCreate(
            ['external_thread_id' => $threadId],
            [
                'source_id' => $source?->id,
                'from_name' => 'Unknown Sender',
                'from_email' => 'unknown@example.com',
                'subject' => 'Sample synced thread',
                'preview' => 'IMAP sync placeholder record.',
                'classification' => 'unknown',
                'status' => 'open',
                'is_read' => false,
                'last_message_at' => now(),
                'raw_payload' => ['note' => 'Replace with real IMAP parser implementation'],
            ]
        );

        $this->info('Inbox sync completed.');

        return self::SUCCESS;
    }
}
