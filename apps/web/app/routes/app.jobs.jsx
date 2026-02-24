import { json } from '@remix-run/node';
import { Form, Link, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const DEFAULT_PER_PAGE = 10;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeJobsPayload(payload, page, perPage) {
  const jobs = Array.isArray(payload)
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
  const total = toPositiveInt(metaPayload.total || payload?.total || jobs.length, jobs.length);
  const lastPage = Math.max(
    1,
    toPositiveInt(
      metaPayload.last_page || payload?.last_page || Math.ceil(total / normalizedPerPage),
      Math.ceil(total / normalizedPerPage) || 1,
    ),
  );

  return {
    jobs,
    meta: {
      page: Math.min(Math.max(1, currentPage), lastPage),
      per_page: normalizedPerPage,
      total,
      last_page: lastPage,
    },
  };
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

function formatSource(source) {
  if (!source) return 'Direct';
  return String(source)
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusPill(status) {
  const value = String(status || 'new').toLowerCase();
  const map = {
    applied: {
      label: 'Applied',
      classes: 'bg-emerald-100 text-emerald-700',
    },
    reviewed: {
      label: 'Interviewing',
      classes: 'bg-amber-100 text-amber-700',
    },
    interviewing: {
      label: 'Interviewing',
      classes: 'bg-amber-100 text-amber-700',
    },
    offer: {
      label: 'Offer',
      classes: 'bg-cyan-100 text-cyan-700',
    },
    offered: {
      label: 'Offer',
      classes: 'bg-cyan-100 text-cyan-700',
    },
    rejected: {
      label: 'Rejected',
      classes: 'bg-red-100 text-red-700',
    },
    new: {
      label: 'New',
      classes: 'bg-slate-100 text-slate-700',
    },
  };

  return map[value] || map.new;
}

function buildJobsQuery(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.source && filters.source !== 'all') params.set('source', filters.source);
  params.set('page', String(filters.page));
  params.set('per_page', String(filters.per_page));
  if (filters.new_job) params.set('new', '1');
  if (filters.notice) params.set('notice', filters.notice);
  return params;
}

function buildLink(filters, patch = {}, options = {}) {
  const params = buildJobsQuery({
    ...filters,
    ...patch,
    new_job: Boolean(options.newJob),
    notice: options.notice || '',
  });
  return `/app/jobs?${params.toString()}`;
}

function getNoticeMessage(code) {
  const map = {
    'new-job': 'New Job assistant opened. Use filters below to find matching roles quickly.',
    'import-csv': 'CSV import will be enabled in a next step. You can still manage jobs from this page.',
    'bulk-status': 'Bulk status update needs row selection support. This action is queued for next update.',
    'bulk-archive': 'Bulk archive needs row selection support. This action is queued for next update.',
    'bulk-delete': 'Bulk delete needs row selection support. This action is queued for next update.',
  };

  return map[code] || '';
}

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const filters = {
    q: (url.searchParams.get('q') || '').trim(),
    status: (url.searchParams.get('status') || 'all').trim().toLowerCase(),
    source: (url.searchParams.get('source') || 'all').trim().toLowerCase(),
    page: toPositiveInt(url.searchParams.get('page'), 1),
    per_page: toPositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE),
    new_job: url.searchParams.get('new') === '1',
    notice: (url.searchParams.get('notice') || '').trim(),
  };

  let jobs = [];
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
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.source && filters.source !== 'all') params.set('source', filters.source);
    params.set('page', String(filters.page));
    params.set('per_page', String(filters.per_page));

    const payload = await apiFetch(request, `/api/jobs?${params.toString()}`);
    const normalized = normalizeJobsPayload(payload, filters.page, filters.per_page);
    jobs = normalized.jobs;
    meta = normalized.meta;
  } catch (e) {
    error = e?.message || 'Unable to load jobs right now.';
  }

  return json({
    jobs,
    meta,
    filters,
    user: auth.user || null,
    error,
    noticeMessage: getNoticeMessage(filters.notice),
  });
}

export default function AppJobsRoute() {
  const { jobs, meta, filters, user, error, noticeMessage } = useLoaderData();
  const displayName = user?.name || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  const start = meta.total > 0 ? (meta.page - 1) * meta.per_page + 1 : 0;
  const end = meta.total > 0 ? Math.min(meta.page * meta.per_page, meta.total) : 0;
  const pages = buildPagination(meta.page, meta.last_page);

  const statusCounts = jobs.reduce(
    (acc, job) => {
      const key = String(job?.status || 'new').toLowerCase();
      if (key === 'applied') acc.applied += 1;
      if (key === 'reviewed' || key === 'interviewing') acc.interviews += 1;
      if (key === 'offer' || key === 'offered') acc.offers += 1;
      return acc;
    },
    { applied: 0, interviews: 0, offers: 0 },
  );

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
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
            <Link to="/app/jobs" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
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
            <Link to="/app/interviews" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">event</span>
              Interviews
            </Link>
            <Link to="/app/analytics" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">bar_chart</span>
              Analytics
            </Link>
          </nav>

          <div className="mt-auto space-y-3">
            <Link to="/app/jobs?new=1" className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add New Job
            </Link>
            <Link to="/app/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Settings
            </Link>
          </div>
        </aside>

        <main className="flex-1 p-3 sm:p-4 lg:p-5">
          <div className="w-full min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:p-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
                <span className="material-symbols-outlined text-[16px]">work</span>
              </div>
              <div>
                <p className="text-sm font-bold leading-none">jobnest</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Jobs Workspace</p>
              </div>
            </div>
            <Link
              to={buildLink(filters, { page: 1 }, { newJob: true, notice: 'new-job' })}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-white"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              New
            </Link>
          </div>

          {noticeMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              {noticeMessage}
            </div>
          ) : null}

          <header className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-black leading-none tracking-tight text-slate-900">Jobs List</h1>
              <p className="mt-1 text-xs text-slate-500">Manage and track your active job applications in real-time.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={buildLink(filters, {}, { notice: 'import-csv' })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-[15px]">description</span>
                Import CSV
              </Link>
              <Link
                to={buildLink(filters, { page: 1 }, { newJob: true, notice: 'new-job' })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                New Job
              </Link>
            </div>
          </header>

          {filters.new_job ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">New Job Assistant</p>
                  <p className="text-xs text-slate-600">No manual create API yet. Use this quick search to pull matching jobs instantly.</p>
                </div>
                <Link
                  to={buildLink(filters, { page: 1 }, {})}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </Link>
              </div>
              <Form method="get" action="/app/jobs" className="mt-3 grid gap-2 md:grid-cols-4">
                <input
                  type="text"
                  name="q"
                  defaultValue={filters.q}
                  placeholder="Try: Frontend, Laravel, React..."
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-emerald-500"
                />
                <select
                  name="source"
                  defaultValue={filters.source}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
                >
                  <option value="all">Any source</option>
                  <option value="arbeitnow">Arbeitnow</option>
                  <option value="remotive">Remotive</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="indeed">Indeed</option>
                </select>
                <select
                  name="status"
                  defaultValue="new"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
                >
                  <option value="new">Only new jobs</option>
                  <option value="all">All statuses</option>
                  <option value="applied">Applied</option>
                  <option value="reviewed">Reviewed</option>
                </select>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="page" value="1" />
                  <input type="hidden" name="per_page" value={String(filters.per_page)} />
                  <button
                    type="submit"
                    className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-emerald-500 px-4 text-xs font-bold text-white hover:bg-emerald-600"
                  >
                    Find Jobs
                  </button>
                </div>
              </Form>
            </section>
          ) : null}

          <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total Active</p>
              <p className="mt-1 text-3xl font-black leading-none">{meta.total}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Applied</p>
              <p className="mt-1 text-3xl font-black leading-none text-[#16a34a]">{statusCounts.applied}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Interviews</p>
              <p className="mt-1 text-3xl font-black leading-none text-[#2563eb]">{statusCounts.interviews}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Offers</p>
              <p className="mt-1 text-3xl font-black leading-none text-[#0ea5e9]">{statusCounts.offers}</p>
            </article>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <Form method="get" action="/app/jobs" className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  name="q"
                  defaultValue={filters.q}
                  placeholder="Search jobs, companies..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-500"
                />
              </div>

              <select
                name="status"
                defaultValue={filters.status}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
              >
                <option value="all">Status: All</option>
                <option value="new">Status: New</option>
                <option value="reviewed">Status: Reviewed</option>
                <option value="applied">Status: Applied</option>
              </select>

              <select
                name="source"
                defaultValue={filters.source}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
              >
                <option value="all">Company: All</option>
                <option value="arbeitnow">Arbeitnow</option>
                <option value="remotive">Remotive</option>
                <option value="linkedin">LinkedIn</option>
                <option value="indeed">Indeed</option>
              </select>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400"
                  aria-label="Filters"
                >
                  <span className="material-symbols-outlined text-[16px]">filter_alt</span>
                </button>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-500 px-4 text-xs font-bold text-white hover:bg-emerald-600"
                >
                  Apply
                </button>
              </div>
              <input type="hidden" name="page" value="1" />
              <input type="hidden" name="per_page" value={String(filters.per_page)} />
            </Form>
          </section>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500" />
                0 rows selected
              </div>
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <Link to={buildLink(filters, {}, { notice: 'bulk-status' })} className="hover:text-slate-600">Change Status</Link>
                <Link to={buildLink(filters, {}, { notice: 'bulk-archive' })} className="hover:text-slate-600">Archive</Link>
                <Link to={buildLink(filters, {}, { notice: 'bulk-delete' })} className="text-red-400 hover:text-red-500">Delete</Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400" />
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Job Title</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Company</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Source</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</th>
                    <th className="w-16 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length ? jobs.map((job, index) => {
                    const pill = getStatusPill(job.status);
                    return (
                      <tr key={job.id || index} className="border-t border-slate-100">
                        <td className="px-3 py-2.5">
                          <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500" />
                        </td>
                        <td className="px-3 py-2.5">
                          <Link to={`/app/jobs/${job.id}`} className="block text-xs font-semibold text-slate-900 hover:text-emerald-700">
                            {job.title || 'Untitled role'}
                          </Link>
                          <p className="text-[10px] text-slate-500">{job.location || 'Full-time • Remote'}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-medium text-slate-700">
                          {job.company || 'Unknown Company'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {formatSource(job.source)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${pill.classes}`}>
                            {pill.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link to={`/app/jobs/${job.id}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-12 text-center">
                        <p className="text-sm font-semibold text-slate-700">No jobs found</p>
                        <p className="mt-1 text-xs text-slate-500">Try changing filters, or open New Job assistant to find fresh roles.</p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                          <Link
                            to={buildLink(filters, { page: 1 }, { newJob: true, notice: 'new-job' })}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600"
                          >
                            <span className="material-symbols-outlined text-[15px]">add</span>
                            Open New Job Assistant
                          </Link>
                          <Link
                            to="/app/dashboard"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Go to Dashboard
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5">
              <p className="text-[11px] text-slate-500">
                Showing {start}-{end} of {meta.total}
              </p>
              <div className="flex items-center gap-1">
                {meta.page > 1 ? (
                  <Link
                    to={buildLink(filters, { page: meta.page - 1 })}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                    Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-300">
                    <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                    Previous
                  </span>
                )}

                {pages.map((page) => (
                  <Link
                    key={page}
                    to={buildLink(filters, { page })}
                    className={page === meta.page
                      ? 'inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-500 px-2 text-xs font-bold text-white'
                      : 'inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100'}
                  >
                    {page}
                  </Link>
                ))}

                {meta.page < meta.last_page ? (
                  <Link
                    to={buildLink(filters, { page: meta.page + 1 })}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    Next
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-300">
                    Next
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-gradient-to-r from-[#071029] via-[#0a2539] to-[#0d3f3f] p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black leading-tight">Scale your search with AI</h2>
                <p className="mt-1 text-xs text-emerald-100">
                  Let our agent auto-fill your profile details on job sites and save hours every week.
                </p>
                <Link to="/app/settings" className="mt-3 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">
                  Try CareerAI Pro
                </Link>
              </div>
              <div className="hidden h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-400/10 lg:flex">
                <span className="material-symbols-outlined text-4xl text-emerald-500">rocket_launch</span>
              </div>
            </div>
          </section>

          <nav className="flex gap-2 overflow-x-auto pt-1 lg:hidden">
            <Link to="/app/dashboard" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Dashboard
            </Link>
            <Link to="/app/jobs" className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white">
              Jobs
            </Link>
            <Link to="/app/applications" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Applications
            </Link>
            <Link to="/app/inbox" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Inbox
            </Link>
            <Link to="/app/interviews" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Interviews
            </Link>
            <Link to="/app/analytics" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Analytics
            </Link>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                {initials}
              </div>
              <span className="max-w-[100px] truncate text-xs font-semibold">{displayName}</span>
            </div>
          </nav>
          </div>
        </main>
      </div>
    </div>
  );
}
