import { json } from '@remix-run/node';
import { Form, Link, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

function normalizeMetrics(payload) {
  if (!payload) return null;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  if (typeof payload === 'object') return payload;
  return null;
}

function normalizeActivity(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeUser(payload) {
  if (!payload) return null;
  if (payload.user && typeof payload.user === 'object') return payload.user;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  if (typeof payload === 'object' && (payload.name || payload.email || payload.role)) return payload;
  return null;
}

function buildActivityFromMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') return [];

  const nowLabel = 'from server metrics';
  const candidates = [
    {
      key: 'jobs_imported',
      value: Number(metrics.jobs_imported ?? metrics.total_jobs ?? 0),
      icon: 'download',
      color: 'emerald',
      title: 'Jobs Imported',
      subtitle: `${Number(metrics.jobs_imported ?? metrics.total_jobs ?? 0)} records available`,
      time_ago: nowLabel,
    },
    {
      key: 'applications_sent',
      value: Number(metrics.applications_sent ?? metrics.applications_total ?? 0),
      icon: 'send',
      color: 'blue',
      title: 'Applications Sent',
      subtitle: `${Number(metrics.applications_sent ?? metrics.applications_total ?? 0)} tracked submissions`,
      time_ago: nowLabel,
    },
    {
      key: 'interviews_scheduled',
      value: Number(metrics.interviews_scheduled ?? 0),
      icon: 'event',
      color: 'orange',
      title: 'Interviews Scheduled',
      subtitle: `${Number(metrics.interviews_scheduled ?? 0)} upcoming interviews`,
      time_ago: nowLabel,
    },
    {
      key: 'replies_received',
      value: Number(metrics.replies_received ?? metrics.inbox_threads ?? 0),
      icon: 'forum',
      color: 'purple',
      title: 'Replies Received',
      subtitle: `${Number(metrics.replies_received ?? metrics.inbox_threads ?? 0)} responses recorded`,
      time_ago: nowLabel,
    },
  ];

  return candidates.filter((item) => item.value > 0).slice(0, 5);
}

export async function loader({ request }) {
  const auth = await requireUser(request);

  const metricsPayload = await apiFetch(request, '/api/metrics').catch(() => null);
  const metrics = normalizeMetrics(metricsPayload);
  const activityPayload = await apiFetch(request, '/api/activity?limit=5').catch(() => []);
  const mePayload = await apiFetch(request, '/api/auth/me').catch(() => null);
  let activity = normalizeActivity(activityPayload);
  const user = normalizeUser(mePayload) || auth.user || null;

  if (!activity.length) {
    activity = buildActivityFromMetrics(metrics);
  }

  return json({
    metrics,
    activity,
    user,
  });
}

function getActivityDotClass(color) {
  const map = {
    green: 'bg-emerald-500',
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    orange: 'bg-amber-500',
    yellow: 'bg-amber-500',
    purple: 'bg-violet-500',
    gray: 'bg-slate-400',
  };

  return map[String(color || '').toLowerCase()] || 'bg-emerald-500';
}

function getActivityIcon(icon) {
  if (!icon) return 'notifications';
  return icon;
}

export default function AppDashboardRoute() {
  const { metrics, activity, user } = useLoaderData();

  const safeMetrics = {
    jobs_imported: Number(metrics?.jobs_imported ?? metrics?.total_jobs ?? 0),
    applications_sent: Number(metrics?.applications_sent ?? metrics?.applications_total ?? 0),
    interviews_scheduled: Number(metrics?.interviews_scheduled || 0),
    replies_received: Number(metrics?.replies_received ?? metrics?.inbox_threads ?? 0),
  };

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
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950 lg:flex">
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
            <Link to="/app/dashboard" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span className="material-symbols-outlined text-[16px]">dashboard</span>
              Dashboard
            </Link>
            <Link to="/app/jobs" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-[16px]">work</span>
              Jobs
            </Link>
            <Link to="/app/applications" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-[16px]">send</span>
              Applications
            </Link>
            <Link to="/app/inbox" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-[16px]">mail</span>
              Inbox
            </Link>
            <Link to="/app/interviews" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-[16px]">event</span>
              Interviews
            </Link>
            <Link to="/app/analytics" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <span className="material-symbols-outlined text-[16px]">bar_chart</span>
              Analytics
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
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Settings
            </Link>
          </div>
        </aside>

        <main className="flex-1 p-3 sm:p-4 lg:p-5">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <header className="flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-6">
                <h1 className="text-sm font-bold tracking-tight">User Dashboard</h1>
                <span className="text-[11px] font-semibold text-slate-400">Overview</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Form method="get" action="/app/applications" className="w-full sm:w-56">
                  <label className="sr-only" htmlFor="applications-search">Search applications</label>
                  <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                      search
                    </span>
                    <input
                      id="applications-search"
                      name="q"
                      type="text"
                      placeholder="Search applications..."
                      className="w-full rounded-lg border-slate-200 py-2 pl-8 pr-3 text-xs focus:border-emerald-400 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                </Form>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                  <span className="material-symbols-outlined text-[16px]">notifications</span>
                </button>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                  <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
                </button>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    {initials}
                  </div>
                  <div className="leading-tight">
                    <p className="max-w-[110px] truncate text-[11px] font-semibold">{displayName}</p>
                    <p className="max-w-[110px] truncate text-[10px] text-slate-500">{displayMeta}</p>
                  </div>
                </div>
              </div>
            </header>

            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              <Link to="/app/dashboard" className="whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
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
              <Link to="/app/inbox" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Inbox
              </Link>
              <Link to="/app/analytics" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Analytics
              </Link>
              <Link to="/app/settings" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                Settings
              </Link>
            </nav>

            <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Jobs Imported</p>
                    <p className="mt-1 text-3xl font-black leading-none">{safeMetrics.jobs_imported}</p>
                  </div>
                  <span className="material-symbols-outlined rounded-md bg-emerald-50 p-1.5 text-[16px] text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">download</span>
                </div>
                <p className="mt-3 text-[10px] font-semibold text-slate-500">from server metrics</p>
              </article>

              <article className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Applications Sent</p>
                    <p className="mt-1 text-3xl font-black leading-none">{safeMetrics.applications_sent}</p>
                  </div>
                  <span className="material-symbols-outlined rounded-md bg-blue-50 p-1.5 text-[16px] text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">description</span>
                </div>
                <p className="mt-3 text-[10px] font-semibold text-slate-500">from server metrics</p>
              </article>

              <article className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Interviews Scheduled</p>
                    <p className="mt-1 text-3xl font-black leading-none">{safeMetrics.interviews_scheduled}</p>
                  </div>
                  <span className="material-symbols-outlined rounded-md bg-amber-50 p-1.5 text-[16px] text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">calendar_today</span>
                </div>
                <p className="mt-3 text-[10px] font-semibold text-slate-500">from server metrics</p>
              </article>

              <article className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Replies Received</p>
                    <p className="mt-1 text-3xl font-black leading-none">{safeMetrics.replies_received}</p>
                  </div>
                  <span className="material-symbols-outlined rounded-md bg-violet-50 p-1.5 text-[16px] text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">forum</span>
                </div>
                <p className="mt-3 text-[10px] font-semibold text-slate-500">from server metrics</p>
              </article>
            </section>

            <section className="mt-4 grid gap-3 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold">Applications vs Replies</h2>
                      <p className="text-[10px] text-slate-500">Track your outreach efficiency over the last 30 days</p>
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

                  <div className="mt-4 overflow-hidden rounded-md bg-gradient-to-b from-emerald-50/40 to-white p-3 dark:from-emerald-950/20 dark:to-slate-900">
                    <svg viewBox="0 0 700 240" preserveAspectRatio="none" className="h-44 w-full">
                      <defs>
                        <linearGradient id="appsArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.20" />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="40" x2="700" y2="40" stroke="#e2e8f0" strokeWidth="1" />
                      <line x1="0" y1="90" x2="700" y2="90" stroke="#e2e8f0" strokeWidth="1" />
                      <line x1="0" y1="140" x2="700" y2="140" stroke="#e2e8f0" strokeWidth="1" />
                      <line x1="0" y1="190" x2="700" y2="190" stroke="#e2e8f0" strokeWidth="1" />

                      <path
                        d="M0,180 C90,165 120,70 190,80 C250,90 290,180 350,170 C420,155 450,40 520,30 C590,20 640,40 700,45"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />

                      <path
                        d="M0,210 C85,200 115,165 190,170 C250,175 300,205 350,200 C410,195 470,130 520,120 C580,110 640,125 700,130"
                        fill="none"
                        stroke="#93c5fd"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray="2 5"
                      />

                      <path
                        d="M0,180 C90,165 120,70 190,80 C250,90 290,180 350,170 C420,155 450,40 520,30 C590,20 640,40 700,45 L700,230 L0,230 Z"
                        fill="url(#appsArea)"
                      />
                    </svg>
                    <div className="mt-2 grid grid-cols-4 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <span>Week 1</span>
                      <span>Week 2</span>
                      <span>Week 3</span>
                      <span>Week 4</span>
                    </div>
                  </div>
                </article>

                <article className="mt-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="text-sm font-bold">Quick Actions</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Link to="/app/applications" className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                      <span className="material-symbols-outlined mb-1 block text-[18px] text-emerald-600">mail</span>
                      Bulk Email
                    </Link>
                    <Link to="/app/settings" className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                      <span className="material-symbols-outlined mb-1 block text-[18px] text-emerald-600">description</span>
                      Update Resume
                    </Link>
                    <Link to="/app/applications" className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                      <span className="material-symbols-outlined mb-1 block text-[18px] text-emerald-600">history</span>
                      Follow-up
                    </Link>
                    <Link to="/app/analytics" className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                      <span className="material-symbols-outlined mb-1 block text-[18px] text-emerald-600">auto_awesome</span>
                      AI Optimize
                    </Link>
                  </div>
                </article>
              </div>

              <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">Recent Activity</h2>
                  <Link to="/app/applications" className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-700">View All</Link>
                </div>

                <div className="mt-4 space-y-3">
                  {activity.length ? activity.map((item, index) => (
                    <div key={item.id || `${item.title || 'activity'}-${index}`} className="relative pl-6">
                      <span className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${getActivityDotClass(item.color)}`} />
                      <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-[15px] text-slate-500">{getActivityIcon(item.icon)}</span>
                          <div>
                            <p className="text-xs font-semibold leading-tight">{item.title || 'Activity update'}</p>
                            <p className="mt-1 text-[10px] text-slate-500">{item.subtitle || 'No details available'}</p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.time_ago || 'Recently'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                      No recent activity yet
                    </div>
                  )}
                </div>
              </article>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
