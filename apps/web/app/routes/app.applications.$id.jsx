import { json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

function normalizeApplication(payload, fallbackId) {
  const record = payload?.data || payload?.application || payload;
  if (!record || typeof record !== 'object') return null;

  return {
    id: record.id || fallbackId,
    job: record.job || null,
    full_name: record.full_name || 'Unknown applicant',
    email: record.email || 'No email',
    phone: record.phone || '—',
    cover_note: record.cover_note || '',
    status: record.status || 'submitted',
    created_at: record.created_at || record.submitted_at || null,
    last_activity: record.last_activity || null,
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export async function loader({ request, params }) {
  await requireUser(request);
  const id = params.id;

  let application = null;
  let error = null;

  try {
    const payload = await apiFetch(request, `/api/applications/${id}`);
    application = normalizeApplication(payload, id);
  } catch (fetchError) {
    error = fetchError?.message || 'Unable to load application details.';
  }

  return json({ application, error });
}

export default function ApplicationDetailsRoute() {
  const { application, error } = useLoaderData();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Application Details</h1>
          <Link to="/app/applications" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
            Back to Applications
          </Link>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Applicant</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{application?.full_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="mt-1 text-sm text-slate-700">{application?.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
              <dd className="mt-1 text-sm text-slate-700">{application?.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1 text-sm text-slate-700">{application?.status || 'submitted'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</dt>
              <dd className="mt-1 text-sm text-slate-700">{formatDate(application?.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Activity</dt>
              <dd className="mt-1 text-sm text-slate-700">{application?.last_activity || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job</dt>
              <dd className="mt-1 text-sm text-slate-700">
                {application?.job?.title || 'Unknown job'}
                {application?.job?.company ? ` • ${application.job.company}` : ''}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cover Note</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{application?.cover_note || 'No cover note provided.'}</dd>
            </div>
          </dl>
        </article>
      </div>
    </div>
  );
}
