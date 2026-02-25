import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const DEFAULT_PER_PAGE = 10;
const VALID_STATUSES = ['all', 'upcoming', 'completed', 'cancelled', 'rescheduled'];
const VALID_TYPES = ['phone', 'technical', 'onsite', 'hr', 'final', 'other'];

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeStatus(value) {
  const status = String(value || 'all').trim().toLowerCase();
  return VALID_STATUSES.includes(status) ? status : 'all';
}

function normalizeType(value) {
  const type = String(value || 'other').trim().toLowerCase();
  return VALID_TYPES.includes(type) ? type : 'other';
}

function normalizeInterviewsPayload(payload, page, perPage) {
  const interviews = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  const metaPayload = payload?.meta || payload?.pagination || {};
  const currentPage = toPositiveInt(
    metaPayload.page || metaPayload.current_page || payload?.current_page || page,
    page,
  );
  const normalizedPerPage = toPositiveInt(
    metaPayload.per_page || payload?.per_page || perPage,
    perPage,
  );
  const total = toPositiveInt(metaPayload.total || payload?.total || interviews.length, interviews.length);
  const lastPage = Math.max(
    1,
    toPositiveInt(
      metaPayload.last_page || payload?.last_page || Math.ceil(total / normalizedPerPage),
      Math.ceil(total / normalizedPerPage) || 1,
    ),
  );

  return {
    interviews,
    meta: {
      page: Math.min(Math.max(1, currentPage), lastPage),
      per_page: normalizedPerPage,
      total,
      last_page: lastPage,
    },
  };
}

function buildSearchParams(filters, patch = {}) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.status && next.status !== 'all') params.set('status', next.status);
  if (next.from) params.set('from', next.from);
  if (next.to) params.set('to', next.to);
  params.set('page', String(next.page));
  params.set('per_page', String(next.per_page));
  if (next.new) params.set('new', '1');
  if (next.notice) params.set('notice', next.notice);
  return params;
}

function buildInterviewsHref(filters, patch = {}) {
  const params = buildSearchParams(filters, patch);
  return `/app/interviews?${params.toString()}`;
}

function formatDateTime(value, timezone) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch (_error) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
}

function getStatusBadge(status) {
  const value = String(status || 'upcoming').toLowerCase();
  const map = {
    upcoming: {
      label: 'Upcoming',
      classes: 'bg-amber-100 text-amber-700',
    },
    completed: {
      label: 'Completed',
      classes: 'bg-emerald-100 text-emerald-700',
    },
    cancelled: {
      label: 'Cancelled',
      classes: 'bg-red-100 text-red-700',
    },
    rescheduled: {
      label: 'Rescheduled',
      classes: 'bg-blue-100 text-blue-700',
    },
  };
  return map[value] || map.upcoming;
}

function getTypeBadge(type) {
  const value = String(type || 'other').toLowerCase();
  const map = {
    phone: 'bg-slate-100 text-slate-700',
    technical: 'bg-indigo-100 text-indigo-700',
    onsite: 'bg-cyan-100 text-cyan-700',
    hr: 'bg-purple-100 text-purple-700',
    final: 'bg-emerald-100 text-emerald-700',
    other: 'bg-slate-100 text-slate-700',
  };
  return map[value] || map.other;
}

function buildPagination(currentPage, lastPage) {
  if (lastPage <= 5) {
    return Array.from({ length: lastPage }, (_, idx) => idx + 1);
  }

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(lastPage, start + 4);

  if (end - start < 4) {
    start = Math.max(1, end - 4);
  }

  const pages = [];
  for (let p = start; p <= end; p += 1) {
    pages.push(p);
  }

  return pages;
}

function parseFilters(url) {
  return {
    q: (url.searchParams.get('q') || '').trim(),
    status: normalizeStatus(url.searchParams.get('status')),
    from: (url.searchParams.get('from') || '').trim(),
    to: (url.searchParams.get('to') || '').trim(),
    page: toPositiveInt(url.searchParams.get('page'), 1),
    per_page: toPositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE),
    new: url.searchParams.get('new') === '1',
    notice: (url.searchParams.get('notice') || '').trim(),
  };
}

function createRedirectWithFilters(filters, patch = {}) {
  return redirect(buildInterviewsHref(filters, patch));
}

function getNoticeMessage(code) {
  const map = {
    created: 'Interview scheduled successfully.',
    updated: 'Interview status updated.',
    deleted: 'Interview deleted.',
  };
  return map[code] || '';
}

function normalizeUiErrorMessage(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'Unable to load interviews right now.';
  if (
    raw.includes('Base table or view not found')
    || raw.includes("Table 'jobnest.interviews' doesn't exist")
  ) {
    return 'Interviews table is not created yet. Run: php artisan migrate';
  }
  return raw;
}

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const filters = parseFilters(url);

  let interviews = [];
  let meta = {
    page: filters.page,
    per_page: filters.per_page,
    total: 0,
    last_page: 1,
  };
  let error = null;

  try {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    params.set('page', String(filters.page));
    params.set('per_page', String(filters.per_page));

    const payload = await apiFetch(request, `/api/interviews?${params.toString()}`);
    const normalized = normalizeInterviewsPayload(payload, filters.page, filters.per_page);
    interviews = normalized.interviews;
    meta = normalized.meta;
  } catch (fetchError) {
    error = normalizeUiErrorMessage(fetchError?.message);
  }

  return json({
    user: auth.user || null,
    filters,
    interviews,
    meta,
    error,
    noticeMessage: getNoticeMessage(filters.notice),
  });
}

export async function action({ request }) {
  await requireUser(request);
  const formData = await request.formData();
  const url = new URL(request.url);
  const baseFilters = parseFilters(url);

  const filters = {
    ...baseFilters,
    q: (String(formData.get('q') || baseFilters.q)).trim(),
    status: normalizeStatus(formData.get('status') || baseFilters.status),
    from: (String(formData.get('from') || baseFilters.from)).trim(),
    to: (String(formData.get('to') || baseFilters.to)).trim(),
    page: toPositiveInt(formData.get('page') || baseFilters.page, baseFilters.page),
    per_page: toPositiveInt(formData.get('per_page') || baseFilters.per_page, baseFilters.per_page),
    new: String(formData.get('new') || (baseFilters.new ? '1' : '0')) === '1',
    notice: '',
  };

  const intent = String(formData.get('intent') || '').trim().toLowerCase();

  try {
    if (intent === 'create') {
      const payload = {
        company: String(formData.get('company') || '').trim(),
        role_title: String(formData.get('role_title') || '').trim(),
        interview_type: normalizeType(formData.get('interview_type')),
        scheduled_at: String(formData.get('scheduled_at') || '').trim(),
        timezone: String(formData.get('timezone') || 'UTC').trim() || 'UTC',
        location: String(formData.get('location') || '').trim() || null,
        meeting_link: String(formData.get('meeting_link') || '').trim() || null,
        interviewer_name: String(formData.get('interviewer_name') || '').trim() || null,
        notes: String(formData.get('notes') || '').trim() || null,
        application_id: String(formData.get('application_id') || '').trim() || null,
        job_id: String(formData.get('job_id') || '').trim() || null,
      };

      await apiFetch(request, '/api/interviews', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return createRedirectWithFilters(filters, { page: 1, new: false, notice: 'created' });
    }

    if (intent === 'update_status') {
      const interviewId = String(formData.get('interview_id') || '').trim();
      const nextStatus = normalizeStatus(formData.get('next_status'));

      if (interviewId && nextStatus !== 'all') {
        await apiFetch(request, `/api/interviews/${interviewId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        });
      }

      return createRedirectWithFilters(filters, { notice: 'updated' });
    }

    if (intent === 'delete') {
      const interviewId = String(formData.get('interview_id') || '').trim();
      if (interviewId) {
        await apiFetch(request, `/api/interviews/${interviewId}`, {
          method: 'DELETE',
        });
      }

      return createRedirectWithFilters(filters, { notice: 'deleted' });
    }

    return createRedirectWithFilters(filters);
  } catch (error) {
    return json(
      {
        error: error?.message || 'Unable to process interview request.',
      },
      { status: error?.status || 400 },
    );
  }
}

export default function AppInterviewsRoute() {
  const { user, filters, interviews, meta, error, noticeMessage } = useLoaderData();
  const actionData = useActionData();

  const start = meta.total > 0 ? (meta.page - 1) * meta.per_page + 1 : 0;
  const end = meta.total > 0 ? Math.min(meta.page * meta.per_page, meta.total) : 0;
  const pages = buildPagination(meta.page, meta.last_page);
  const displayName = user?.name || 'User';
  const displayEmail = user?.email || '';
  const displayMeta = displayEmail || (user?.role ? String(user.role).toUpperCase() : 'ACCOUNT');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-4 lg:flex">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-white">
              <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
            </div>
            <div>
              <p className="text-sm font-bold leading-none">jobnest</p>
              <p className="text-[11px] text-slate-500">application tracker</p>
            </div>
          </div>

          <nav className="mt-5 space-y-1">
            <Link to="/app/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">dashboard</span>
              Dashboard
            </Link>
            <Link to="/app/jobs" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">work</span>
              Jobs
            </Link>
            <Link to="/app/applications" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">send</span>
              Applications
            </Link>
            <Link to="/app/inbox" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">mail</span>
              Inbox
            </Link>
            <Link to="/app/interviews" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <span className="material-symbols-outlined text-[16px]">event</span>
              Interviews
            </Link>
            <Link to="/app/analytics" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">bar_chart</span>
              Analytics
            </Link>
            <Link to="/app/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">person</span>
              Profile
            </Link>
          </nav>

          <div className="mt-auto space-y-3">
            <Link
              to="/app/jobs?new=1"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add New Job
            </Link>
            <Link
              to="/app/settings"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Settings
            </Link>
          </div>
        </aside>

        <main className="flex-1 p-3 sm:p-4 lg:p-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Interviews</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Track upcoming and completed interviews.</p>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                  {initials}
                </div>
                <div className="leading-tight">
                  <p className="max-w-[120px] truncate text-[11px] font-semibold">{displayName}</p>
                  <p className="max-w-[120px] truncate text-[10px] text-slate-500">{displayMeta}</p>
                </div>
              </div>
            </header>

            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              <Link to="/app/dashboard" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Dashboard
              </Link>
              <Link to="/app/jobs" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Jobs
              </Link>
              <Link to="/app/applications" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Applications
              </Link>
              <Link to="/app/inbox" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Inbox
              </Link>
              <Link to="/app/interviews" className="whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                Interviews
              </Link>
              <Link to="/app/analytics" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Analytics
              </Link>
              <Link to="/app/profile" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Profile
              </Link>
              <Link to="/app/settings" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Settings
              </Link>
            </nav>

            <section className="mt-4 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Form method="get" className="grid gap-2 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className="sr-only" htmlFor="interviews-q">Search interviews</label>
                    <input
                      id="interviews-q"
                      name="q"
                      type="text"
                      defaultValue={filters.q}
                      placeholder="Search by company or role"
                      className="w-full rounded-xl border-slate-300 text-sm"
                    />
                  </div>

                  <label className="sr-only" htmlFor="interviews-status">Status</label>
                  <select
                    id="interviews-status"
                    name="status"
                    defaultValue={filters.status}
                    className="w-full rounded-xl border-slate-300 text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="rescheduled">Rescheduled</option>
                  </select>

                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor="interviews-from">From</label>
                    <input
                      id="interviews-from"
                      type="date"
                      name="from"
                      defaultValue={filters.from}
                      className="w-full rounded-xl border-slate-300 text-sm"
                    />
                    <label className="sr-only" htmlFor="interviews-to">To</label>
                    <input
                      id="interviews-to"
                      type="date"
                      name="to"
                      defaultValue={filters.to}
                      className="w-full rounded-xl border-slate-300 text-sm"
                    />
                  </div>

                  <input type="hidden" name="page" value="1" />
                  <input type="hidden" name="per_page" value={String(filters.per_page)} />
                  <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                    Apply
                  </button>
                </Form>

                <Link
                  to={buildInterviewsHref(filters, { new: true })}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Schedule Interview
                </Link>
              </div>

              {noticeMessage ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {noticeMessage}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              {actionData?.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {actionData.error}
                </div>
              ) : null}

              {filters.new ? (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h2 className="text-lg font-bold text-slate-900">Schedule Interview</h2>
                  <p className="mt-1 text-sm text-slate-600">Create an interview event to track preparation and outcomes.</p>

                  <Form method="post" className="mt-4 grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="intent" value="create" />
                    <input type="hidden" name="q" value={filters.q} />
                    <input type="hidden" name="status" value={filters.status} />
                    <input type="hidden" name="from" value={filters.from} />
                    <input type="hidden" name="to" value={filters.to} />
                    <input type="hidden" name="page" value={String(filters.page)} />
                    <input type="hidden" name="per_page" value={String(filters.per_page)} />

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-company">Company</label>
                      <input id="interview-company" name="company" type="text" required className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-role-title">Role Title</label>
                      <input id="interview-role-title" name="role_title" type="text" required className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-type">Interview Type</label>
                      <select id="interview-type" name="interview_type" defaultValue="other" className="mt-1 w-full rounded-xl border-slate-300 text-sm">
                        <option value="phone">Phone</option>
                        <option value="technical">Technical</option>
                        <option value="onsite">Onsite</option>
                        <option value="hr">HR</option>
                        <option value="final">Final</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-scheduled-at">Scheduled Date & Time</label>
                      <input id="interview-scheduled-at" name="scheduled_at" type="datetime-local" required className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-timezone">Timezone</label>
                      <input id="interview-timezone" name="timezone" type="text" defaultValue="UTC" className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-location">Location</label>
                      <input id="interview-location" name="location" type="text" placeholder="Zoom / Onsite / Phone" className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-link">Meeting Link</label>
                      <input id="interview-link" name="meeting_link" type="url" placeholder="https://..." className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interviewer-name">Interviewer</label>
                      <input id="interviewer-name" name="interviewer_name" type="text" className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-application-id">Application ID (optional)</label>
                      <input id="interview-application-id" name="application_id" type="number" min="1" className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-job-id">Job ID (optional)</label>
                      <input id="interview-job-id" name="job_id" type="number" min="1" className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="interview-notes">Notes</label>
                      <textarea id="interview-notes" name="notes" rows={4} className="mt-1 w-full rounded-xl border-slate-300 text-sm" />
                    </div>

                    <div className="md:col-span-2 flex items-center justify-end gap-2">
                      <Link to={buildInterviewsHref(filters, { new: false })} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                        Cancel
                      </Link>
                      <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                        Save
                      </button>
                    </div>
                  </Form>
                </section>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Date/Time</th>
                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Company & Role</th>
                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Type</th>
                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</th>
                        <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {interviews.map((interview) => {
                        const statusBadge = getStatusBadge(interview.status);
                        const typeLabel = String(interview.interview_type || 'other').replace(/\b\w/g, (char) => char.toUpperCase());
                        const typeClasses = getTypeBadge(interview.interview_type);
                        return (
                          <tr key={interview.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm text-slate-700">
                              <p className="font-semibold text-slate-900">{formatDateTime(interview.scheduled_at, interview.timezone)}</p>
                              <p className="text-xs text-slate-500">{interview.timezone || 'UTC'}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-slate-900">{interview.company}</p>
                              <p className="text-xs text-slate-500">{interview.role_title}</p>
                              {interview.location ? <p className="text-xs text-slate-500">{interview.location}</p> : null}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${typeClasses}`}>
                                {typeLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusBadge.classes}`}>
                                {statusBadge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Form method="post">
                                  <input type="hidden" name="intent" value="update_status" />
                                  <input type="hidden" name="interview_id" value={String(interview.id)} />
                                  <input type="hidden" name="next_status" value="completed" />
                                  <input type="hidden" name="q" value={filters.q} />
                                  <input type="hidden" name="status" value={filters.status} />
                                  <input type="hidden" name="from" value={filters.from} />
                                  <input type="hidden" name="to" value={filters.to} />
                                  <input type="hidden" name="page" value={String(filters.page)} />
                                  <input type="hidden" name="per_page" value={String(filters.per_page)} />
                                  <button
                                    type="submit"
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={interview.status === 'completed'}
                                  >
                                    Mark Completed
                                  </button>
                                </Form>

                                <Form method="post">
                                  <input type="hidden" name="intent" value="update_status" />
                                  <input type="hidden" name="interview_id" value={String(interview.id)} />
                                  <input type="hidden" name="next_status" value="rescheduled" />
                                  <input type="hidden" name="q" value={filters.q} />
                                  <input type="hidden" name="status" value={filters.status} />
                                  <input type="hidden" name="from" value={filters.from} />
                                  <input type="hidden" name="to" value={filters.to} />
                                  <input type="hidden" name="page" value={String(filters.page)} />
                                  <input type="hidden" name="per_page" value={String(filters.per_page)} />
                                  <button
                                    type="submit"
                                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={interview.status === 'rescheduled'}
                                  >
                                    Reschedule
                                  </button>
                                </Form>

                                <Form method="post">
                                  <input type="hidden" name="intent" value="update_status" />
                                  <input type="hidden" name="interview_id" value={String(interview.id)} />
                                  <input type="hidden" name="next_status" value="cancelled" />
                                  <input type="hidden" name="q" value={filters.q} />
                                  <input type="hidden" name="status" value={filters.status} />
                                  <input type="hidden" name="from" value={filters.from} />
                                  <input type="hidden" name="to" value={filters.to} />
                                  <input type="hidden" name="page" value={String(filters.page)} />
                                  <input type="hidden" name="per_page" value={String(filters.per_page)} />
                                  <button
                                    type="submit"
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={interview.status === 'cancelled'}
                                  >
                                    Cancel
                                  </button>
                                </Form>

                                <Form method="post">
                                  <input type="hidden" name="intent" value="delete" />
                                  <input type="hidden" name="interview_id" value={String(interview.id)} />
                                  <input type="hidden" name="q" value={filters.q} />
                                  <input type="hidden" name="status" value={filters.status} />
                                  <input type="hidden" name="from" value={filters.from} />
                                  <input type="hidden" name="to" value={filters.to} />
                                  <input type="hidden" name="page" value={String(filters.page)} />
                                  <input type="hidden" name="per_page" value={String(filters.per_page)} />
                                  <button
                                    type="submit"
                                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                  >
                                    Delete
                                  </button>
                                </Form>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!interviews.length ? (
                  <div className="border-t border-slate-100 px-4 py-10 text-center">
                    <p className="text-lg font-bold text-slate-900">No interviews scheduled</p>
                    <p className="mt-2 text-sm text-slate-500">Start tracking your interview pipeline from here.</p>
                    <Link
                      to={buildInterviewsHref(filters, { new: true })}
                      className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                    >
                      Schedule your first interview
                    </Link>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Showing {start}-{end} of {meta.total}
                  </p>

                  <div className="flex items-center gap-1">
                    <Link
                      to={buildInterviewsHref(filters, { page: Math.max(1, meta.page - 1) })}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                        meta.page <= 1
                          ? 'pointer-events-none border border-slate-200 text-slate-300'
                          : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Previous
                    </Link>

                    {pages.map((page) => (
                      <Link
                        key={page}
                        to={buildInterviewsHref(filters, { page })}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                          page === meta.page
                            ? 'bg-emerald-500 text-white'
                            : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {page}
                      </Link>
                    ))}

                    <Link
                      to={buildInterviewsHref(filters, { page: Math.min(meta.last_page, meta.page + 1) })}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                        meta.page >= meta.last_page
                          ? 'pointer-events-none border border-slate-200 text-slate-300'
                          : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              </section>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
