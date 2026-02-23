import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { AdminNav } from '../components/Nav';
import { apiFetch } from '../lib/api.server';
import { requireAdmin } from '../lib/session.server';

export async function loader({ request }) {
  await requireAdmin(request);

  try {
    const logs = await apiFetch(request, '/api/admin/email-logs');
    return json({ logs });
  } catch (error) {
    return json({ error: error.message, logs: null }, { status: error.status || 500 });
  }
}

export default function AdminEmailLogsRoute() {
  const data = useLoaderData();
  const logs = data.logs?.data || [];

  return (
    <div>
      <h1>Admin Email Logs</h1>
      <AdminNav />

      {data.error ? <div className="banner error">{data.error}</div> : null}

      <div className="panel">
        {logs.length ? (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Sent At</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.to_email}</td>
                  <td>{log.subject}</td>
                  <td><span className="badge">{log.status}</span></td>
                  <td>{log.sent_at || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No email logs available.</div>
        )}
      </div>
    </div>
  );
}
