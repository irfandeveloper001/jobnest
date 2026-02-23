<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>New Job Application</title>
</head>
<body>
    <h2>New Job Application Received</h2>
    <p><strong>Job:</strong> {{ $job->title }}</p>
    <p><strong>Company:</strong> {{ $job->company_name ?? 'N/A' }}</p>
    <p><strong>Applicant Name:</strong> {{ $application->full_name }}</p>
    <p><strong>Applicant Email:</strong> {{ $application->email }}</p>
    @if ($application->phone)
        <p><strong>Applicant Phone:</strong> {{ $application->phone }}</p>
    @endif
    @if ($application->cover_note)
        <p><strong>Cover Note:</strong></p>
        <p>{{ $application->cover_note }}</p>
    @endif
    <p>The CV is attached with this email.</p>
</body>
</html>
