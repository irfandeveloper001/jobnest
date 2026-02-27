import { json } from '@remix-run/node';
import { Form, Link, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const DEFAULT_PER_PAGE = 10;
const STATUS_OPTIONS = ['all', 'submitted', 'emailed', 'replied'];

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeStatus(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return STATUS_OPTIONS.includes(normalized) ? normalized : 'all';
}

function normalizeApplicationsPayload(payload, page, perPage) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const metaPayload = payload?.meta || {};

  return {
    applications: rows,
    stages: Array.isArray(payload?.stages) ? payload.stages : [],
    meta: {
      page: toPositiveInt(metaPayload.page, page),
      per_page: toPositiveInt(metaPayload.per_page, perPage),
      total: toPositiveInt(metaPayload.total, rows.length),
      last_page: Math.max(1, toPositiveInt(metaPayload.last_page, 1)),
    },
  };
}

function buildQuery(filters, patch = {}) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.stage && next.stage !== 'all') params.set('stage', next.stage);
  if (next.status && next.status !== 'all') params.set('status', next.status);
  params.set('page', String(next.page));
  params.set('per_page', String(next.per_page));
  return params;
}

function buildPageLink(filters, patch = {}) {
  return `/app/applications?${buildQuery(filters, patch).toString()}`;
}

function buildPagination(currentPage, lastPage) {
  if (lastPage <= 5) {
    return Array.from({ length: lastPage }, (_, idx) => idx + 1);
  }
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(lastPage, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  const pages = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function getStatusBadge(status) {
  const value = String(status || 'submitted').toLowerCase();
  const map = {
    submitted: { label: 'Submitted', classes: 'bg-slate-100 text-slate-700' },
    emailed: { label: 'Emailed', classes: 'bg-emerald-100 text-emerald-700' },
    replied: { label: 'Replied', classes: 'bg-blue-100 text-blue-700' },
  };
  return map[value] || map.submitted;
}

function getStageBadge(stage) {
  const value = String(stage?.key || '').toLowerCase();
  const map = {
    saved: 'bg-slate-100 text-slate-700',
    applied: 'bg-emerald-100 text-emerald-700',
    interview: 'bg-blue-100 text-blue-700',
    offer: 'bg-violet-100 text-violet-700',
    rejected: 'bg-rose-100 text-rose-700',
  };
  return map[value] || 'bg-slate-100 text-slate-700';
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

export async function loader({ request }) {
  await requireUser(request);
  const url = new URL(request.url);

  const filters = {
    q: (url.searchParams.get('q') || '').trim(),
    stage: (url.searchParams.get('stage') || 'all').trim().toLowerCase(),
    status: normalizeStatus(url.searchParams.get('status')),
    page: toPositiveInt(url.searchParams.get('page'), 1),
    per_page: toPositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE),
  };

  let applications = [];
  let stages = [];
  let meta = {
    page: filters.page,
    per_page: filters.per_page,
    total: 0,
    last_page: 1,
  };
  let error = null;

  try {
    const params = buildQuery(filters);
    const payload = await apiFetch(request, `/api/applications?${params.toString()}`);
    const normalized = normalizeApplicationsPayload(payload, filters.page, filters.per_page);
    applications = normalized.applications;
    stages = normalized.stages;
    meta = normalized.meta;
  } catch (fetchError) {
    error = fetchError?.message || 'Unable to load applications right now.';
  }

  return json({
    applications,
    stages,
    meta,
    filters,
    error,
  });
}

export default function AppApplicationsRoute() {
  const { applications, stages, meta, filters, error } = useLoaderData();
  const pages = buildPagination(meta.page, meta.last_page);
  const start = meta.total > 0 ? (meta.page - 1) * meta.per_page + 1 : 0;
  const end = meta.total > 0 ? Math.min(meta.page * meta.per_page, meta.total) : 0;

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
            <Link to="/app/applications" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <span className="material-symbols-outlined text-[16px]">send</span>
              Applications
            </Link>
            <Link to="/app/followups" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Follow-ups
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
            <Link to="/app/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">person</span>
              Profile
            </Link>
          </nav>
        </aside>

        <main className="flex-1 p-3 sm:p-4 lg:p-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Application Tracker</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Track stages, timeline events, and follow-up outcomes.</p>
              </div>
              <Link to="/app/followups" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                <span className="material-symbols-outlined text-[15px]">schedule</span>
                View Follow-ups
              </Link>
            </header>

            <section className="mt-4 rounded-xl border border-slate-200 p-3">
              <Form method="get" className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                    search
                  </span>
                  <input
                    name="q"
                    type="text"
                    defaultValue={filters.q}
                    placeholder="Search job/company/applicant/email"
                    className="w-full rounded-lg border-slate-200 py-2 pl-8 pr-3 text-xs focus:border-emerald-400 focus:ring-emerald-400"
                  />
                </div>

                <select
                  name="stage"
                  defaultValue={filters.stage}
                  className="rounded-lg border-slate-200 py-2 text-xs focus:border-emerald-400 focus:ring-emerald-400"
                >
                  <option value="all">All stages</option>
                  {stages.map((stage) => (
                    <option key={stage.key} value={stage.key}>{stage.label}</option>
                  ))}
                </select>

                <select
                  name="status"
                  defaultValue={filters.status}
                  className="rounded-lg border-slate-200 py-2 text-xs focus:border-emerald-400 focus:ring-emerald-400"
                >
                  <option value="all">All delivery statuses</option>
                  <option value="submitted">Submitted</option>
                  <option value="emailed">Emailed</option>
                  <option value="replied">Replied</option>
                </select>

                <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                  Apply
                </button>

                <input type="hidden" name="page" value="1" />
                <input type="hidden" name="per_page" value={String(filters.per_page)} />
              </Form>

              {error ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              ) : null}
            </section>

            <section className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Job</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Applicant</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Stage</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Delivery</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Date</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {applications.map((application) => {
                      const deliveryBadge = getStatusBadge(application?.status);
                      const stageBadgeClass = getStageBadge(application?.stage);

                      return (
                        <tr key={application?.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">{application?.job?.title || 'Job'}</p>
                            <p className="text-xs text-slate-500">{application?.job?.company || 'Unknown company'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-slate-800">{application?.full_name || 'Unknown applicant'}</p>
                            <p className="text-xs text-slate-500">{application?.email || 'No email'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${stageBadgeClass}`}>
                              {application?.stage?.label || 'Saved'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${deliveryBadge.classes}`}>
                              {deliveryBadge.label}
                            </span>
                            {application?.last_activity ? (
                              <p className="mt-1 text-[11px] text-slate-500">{application.last_activity}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{formatDate(application?.created_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to={`/app/applications/${application?.id}`}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!applications.length ? (
                <div className="border-t border-slate-100 px-4 py-10 text-center">
                  <p className="text-lg font-bold text-slate-900">No applications found</p>
                  <p className="mt-2 text-sm text-slate-500">Try changing filters or start applying to matching jobs.</p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <Link to="/app/jobs" className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                      Go to Jobs
                    </Link>
                    <Link to="/app/followups" className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                      View Follow-ups
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Showing {start}-{end} of {meta.total}
                </p>

                <div className="flex items-center gap-1">
                  <Link
                    to={buildPageLink(filters, { page: Math.max(1, meta.page - 1) })}
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
                      to={buildPageLink(filters, { page })}
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
                    to={buildPageLink(filters, { page: Math.min(meta.last_page, meta.page + 1) })}
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
          </div>
        </main>
      </div>
    </div>
  );
}

