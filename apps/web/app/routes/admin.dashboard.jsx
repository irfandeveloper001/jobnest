import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { AdminNav } from '../components/Nav';
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
    });
  } catch (error) {
    return json({ error: error.message, metrics: {}, usersTotal: 0, sourcesTotal: 0 }, { status: error.status || 500 });
  }
}

export default function AdminDashboardRoute() {
  const data = useLoaderData();

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <AdminNav />

      {data.error ? <div className="banner error">{data.error}</div> : null}

      <div className="grid two">
        <div className="panel">
          <div className="muted">Registered users</div>
          <h2>{data.usersTotal}</h2>
        </div>
        <div className="panel">
          <div className="muted">Job sources</div>
          <h2>{data.sourcesTotal}</h2>
        </div>
      </div>

      <div className="grid two">
        {Object.entries(data.metrics || {}).map(([key, value]) => (
          <div className="panel" key={key}>
            <div className="muted">{key.replaceAll('_', ' ')}</div>
            <h2>{value}</h2>
          </div>
        ))}
      </div>
    </div>
  );
}
