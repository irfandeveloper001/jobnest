<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Str;

class TemplateVariableRenderer
{
    public const TOKENS = [
        'first_name',
        'last_name',
        'company_name',
        'job_title',
        'meeting_link',
    ];

    public static function normalizeContext(array $context = []): array
    {
        return [
            'first_name' => (string) ($context['first_name'] ?? 'Sarah'),
            'last_name' => (string) ($context['last_name'] ?? 'Jenkins'),
            'company_name' => (string) ($context['company_name'] ?? 'Innovate Co.'),
            'job_title' => (string) ($context['job_title'] ?? 'VP Product'),
            'meeting_link' => (string) ($context['meeting_link'] ?? 'https://cal.com/jobnest/15min'),
        ];
    }

    public static function defaultContextForUser(?User $user): array
    {
        $base = self::normalizeContext();

        if (! $user) {
            return $base;
        }

        return array_merge($base, [
            'first_name' => $base['first_name'],
            'last_name' => $base['last_name'],
            'meeting_link' => 'https://cal.com/'.Str::slug($user->name ?? 'jobnest', '/').'/15min',
        ]);
    }

    public static function render(string $content, array $context): string
    {
        $safeContext = self::normalizeContext($context);
        $replacements = [];

        foreach (self::TOKENS as $token) {
            $replacements['{{'.$token.'}}'] = (string) ($safeContext[$token] ?? '');
        }

        return strtr($content, $replacements);
    }
}
