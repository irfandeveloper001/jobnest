import { json } from '@remix-run/node';
import { Form, Link, useLoaderData } from '@remix-run/react';
import { requireUser } from '../lib/session.server';

const VALID_RANGES = [7, 30, 90];

function normalizeRange(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return VALID_RANGES.includes(parsed) ? parsed : 30;
}

function createEmptyPayload(range) {
  const labels = [];
  const applications = [];
  const replies = [];
  const end = new Date();
  for (let i = range - 1; i >= 0; i -= 1) {
    const day = new Date(end);
    day.setDate(end.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    labels.push(key);
    applications.push(0);
    replies.push(0);
  }

  return {
    range_days: range,
    kpis: {
      jobs_imported: 0,
      applications_submitted: 0,
      applications_emailed: 0,
      replies_received: 0,
      reply_rate: 0,
      avg_reply_time_hours: null,
    },
    trends: {
      labels,
      applications,
      replies,
    },
    breakdowns: {
      by_source: [
        { source: 'arbeitnow', jobs: 0, applications: 0 },
        { source: 'remotive', jobs: 0, applications: 0 },
        { source: 'manual', jobs: 0, applications: 0 },
      ],
      by_status: [
        { status: 'submitted', count: 0 },
        { status: 'emailed', count: 0 },
        { status: 'replied', count: 0 },
      ],
    },
  };
}

function normalizePayload(payload, range) {
  const fallback = createEmptyPayload(range);
  if (!payload || typeof payload !== 'object') return fallback;

  const labels = Array.isArray(payload?.trends?.labels) ? payload.trends.labels : fallback.trends.labels;
  const applications = Array.isArray(payload?.trends?.applications) ? payload.trends.applications : fallback.trends.applications;
  const replies = Array.isArray(payload?.trends?.replies) ? payload.trends.replies : fallback.trends.replies;

  return {
    range_days: normalizeRange(payload.range_days),
    kpis: {
      jobs_imported: Number(payload?.kpis?.jobs_imported || 0),
      applications_submitted: Number(payload?.kpis?.applications_submitted || 0),
      applications_emailed: Number(payload?.kpis?.applications_emailed || 0),
      replies_received: Number(payload?.kpis?.replies_received || 0),
      reply_rate: Number(payload?.kpis?.reply_rate || 0),
      avg_reply_time_hours: payload?.kpis?.avg_reply_time_hours === null || payload?.kpis?.avg_reply_time_hours === undefined
        ? null
        : Number(payload.kpis.avg_reply_time_hours),
    },
    trends: {
      labels,
      applications: applications.map((value) => Number(value || 0)),
      replies: replies.map((value) => Number(value || 0)),
    },
    breakdowns: {
      by_source: Array.isArray(payload?.breakdowns?.by_source) ? payload.breakdowns.by_source : fallback.breakdowns.by_source,
      by_status: Array.isArray(payload?.breakdowns?.by_status) ? payload.breakdowns.by_status : fallback.breakdowns.by_status,
    },
  };
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatHours(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}h`;
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function chartPoint(values, index, width, height, padding, maxValue) {
  const total = Math.max(values.length - 1, 1);
  const x = padding + (index / total) * (width - padding * 2);
  const y = height - padding - ((values[index] || 0) / maxValue) * (height - padding * 2);
  return { x, y };
}

function buildPath(values, width, height, padding, maxValue) {
  if (!values.length) return '';
  return values
    .map((_, index) => {
      const point = chartPoint(values, index, width, height, padding, maxValue);
      return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
    })
    .join(' ');
}

function buildAreaPath(values, width, height, padding, maxValue) {
  if (!values.length) return '';
  const path = buildPath(values, width, height, padding, maxValue);
  const first = chartPoint(values, 0, width, height, padding, maxValue);
  const last = chartPoint(values, values.length - 1, width, height, padding, maxValue);
  const baseline = height - padding;
  return `${path} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const range = normalizeRange(url.searchParams.get('range'));

  let data = createEmptyPayload(range);
  let error = null;

  try {
    const response = await fetch(`${url.origin}/api/analytics/overview?range=${range}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Cookie: request.headers.get('Cookie') || '',
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      error = payload?.message || `Unable to load analytics (${response.status})`;
    } else {
      data = normalizePayload(payload, range);
    }
  } catch (fetchError) {
    error = fetchError?.message || 'Unable to load analytics.';
  }

  return json({
    user: auth.user || null,
    range,
    data,
    error,
  });
}

export default function AppAnalyticsRoute() {
  const { user, range, data, error } = useLoaderData();
  const displayName = user?.name || 'User';
  const displayEmail = user?.email || '';
  const displayMeta = displayEmail || (user?.role ? String(user.role).toUpperCase() : 'ACCOUNT');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  const labels = data?.trends?.labels || [];
  const applications = data?.trends?.applications || [];
  const replies = data?.trends?.replies || [];
  const chartWidth = 900;
  const chartHeight = 280;
  const chartPadding = 28;
  const maxValue = Math.max(1, ...applications, ...replies);
  const applicationsPath = buildPath(applications, chartWidth, chartHeight, chartPadding, maxValue);
  const repliesPath = buildPath(replies, chartWidth, chartHeight, chartPadding, maxValue);
  const areaPath = buildAreaPath(applications, chartWidth, chartHeight, chartPadding, maxValue);
  const tickIndexes = labels.length > 4
    ? [0, Math.floor(labels.length / 3), Math.floor((labels.length * 2) / 3), labels.length - 1]
    : labels.map((_, index) => index);
  const uniqueTickIndexes = [...new Set(tickIndexes)].filter((index) => index >= 0 && index < labels.length);

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
            <Link to="/app/interviews" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">event</span>
              Interviews
            </Link>
            <Link to="/app/analytics" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
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
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Analytics</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Measure conversion rates and outreach performance.</p>
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
              <Link to="/app/interviews" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Interviews
              </Link>
              <Link to="/app/analytics" className="whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Form method="get" className="flex items-center gap-2">
                  <label htmlFor="analytics-range" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Range</label>
                  <select
                    id="analytics-range"
                    name="range"
                    defaultValue={String(range)}
                    className="rounded-xl border-slate-300 text-sm"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                  <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                    Apply
                  </button>
                </Form>
                <p className="text-xs text-slate-500">Showing last {data.range_days} days</p>
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Jobs Imported</p>
                  <p className="mt-1 text-3xl font-black leading-none">{data.kpis.jobs_imported}</p>
                </article>
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Applications Submitted</p>
                  <p className="mt-1 text-3xl font-black leading-none">{data.kpis.applications_submitted}</p>
                </article>
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Emails Sent</p>
                  <p className="mt-1 text-3xl font-black leading-none">{data.kpis.applications_emailed}</p>
                </article>
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Replies Received</p>
                  <p className="mt-1 text-3xl font-black leading-none">{data.kpis.replies_received}</p>
                </article>
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reply Rate</p>
                  <p className="mt-1 text-3xl font-black leading-none">{formatPercent(data.kpis.reply_rate)}</p>
                </article>
                <article className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Avg Reply Time</p>
                  <p className="mt-1 text-3xl font-black leading-none">{formatHours(data.kpis.avg_reply_time_hours)}</p>
                </article>
              </section>

              <article className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold">Applications vs Replies</h2>
                    <p className="text-[10px] text-slate-500">Daily trend across selected range</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />Applications
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />Replies
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[240px] w-full" preserveAspectRatio="none" role="img" aria-label="Analytics trend chart">
                    <defs>
                      <linearGradient id="analyticsAreaGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const y = chartHeight - chartPadding - ratio * (chartHeight - chartPadding * 2);
                      return (
                        <line
                          key={ratio}
                          x1={chartPadding}
                          y1={y}
                          x2={chartWidth - chartPadding}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeWidth="1"
                        />
                      );
                    })}

                    {areaPath ? <path d={areaPath} fill="url(#analyticsAreaGradient)" /> : null}
                    {applicationsPath ? <path d={applicationsPath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" /> : null}
                    {repliesPath ? <path d={repliesPath} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeDasharray="7 6" strokeLinecap="round" /> : null}
                  </svg>

                  <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {uniqueTickIndexes.map((index) => (
                      <span key={index}>{shortDate(labels[index])}</span>
                    ))}
                  </div>
                </div>
              </article>

              <section className="grid gap-3 lg:grid-cols-2">
                <article className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-bold">By Source</h3>
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                    <table className="min-w-full text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Source</th>
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Jobs</th>
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Applications</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(data.breakdowns.by_source || []).map((row) => (
                          <tr key={row.source}>
                            <td className="px-3 py-2 text-sm font-semibold text-slate-800">{String(row.source || 'manual')}</td>
                            <td className="px-3 py-2 text-sm text-slate-700">{Number(row.jobs || 0)}</td>
                            <td className="px-3 py-2 text-sm text-slate-700">{Number(row.applications || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-bold">By Status</h3>
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                    <table className="min-w-full text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</th>
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(data.breakdowns.by_status || []).map((row) => (
                          <tr key={row.status}>
                            <td className="px-3 py-2 text-sm font-semibold capitalize text-slate-800">{String(row.status || 'submitted')}</td>
                            <td className="px-3 py-2 text-sm text-slate-700">{Number(row.count || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
