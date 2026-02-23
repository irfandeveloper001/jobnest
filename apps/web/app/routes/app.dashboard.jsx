import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';
import { UserNav } from '../components/Nav';

export async function loader({ request }) {
  const auth = await requireUser(request);

  try {
    const payload = await apiFetch(request, '/api/metrics');
    return json({ metrics: payload.data || {}, role: auth.role });
  } catch (error) {
    return json({ error: error.message, metrics: {}, role: auth.role }, { status: error.status || 500 });
  }
}

export default function AppDashboardRoute() {
  const data = useLoaderData();
  const metrics = data.metrics || {};

  return (
    <div>
      <h1>User Dashboard</h1>
      <UserNav isAdmin={data.role === 'admin'} />

      {data.error ? <div className="banner error">{data.error}</div> : null}

      <div className="grid two">
        {Object.entries(metrics).map(([key, value]) => (
          <div className="panel" key={key}>
            <div className="muted">{key.replaceAll('_', ' ')}</div>
            <h2>{value}</h2>
          </div>
        ))}
      </div>

      {!Object.keys(metrics).length ? <div className="panel muted">No metrics available yet.</div> : null}
    </div>
  );
}
