import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import AppLayout from '../components/AppLayout';
import { apiFetch } from '../lib/api.server';
import { requireAdmin } from '../lib/session.server';

export async function loader({ request }) {
  await requireAdmin(request);

  try {
    const [metrics, users, sources] = await Promise.all([
      apiFetch(request, '/api/metrics'),
      apiFetch(request, '/api/admin/users?per_page=1'),
      apiFetch(request, '/api/admin/job-sources'),
    ]);

    return json({
      metrics: metrics.data || {},
      usersTotal: users.total || 0,
      sourcesTotal: sources.data?.length || 0,
      role: 'admin',
    });
  } catch (error) {
    return json({ metrics: {}, usersTotal: 0, sourcesTotal: 0, role: 'admin', error: error.message }, { status: error.status || 500 });
  }
}

export default function AdminDashboardRoute() {
  const data = useLoaderData();

  return (
    <AppLayout title="Admin Dashboard" subtitle="Operational visibility across the platform." role={data.role}>
      {data.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{data.error}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Users</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{data.usersTotal}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Job Sources</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{data.sourcesTotal}</p>
        </article>
        {Object.entries(data.metrics || {}).map(([key, value]) => (
          <article key={key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{key.replaceAll('_', ' ')}</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
          </article>
        ))}
      </section>
    </AppLayout>
  );
}
