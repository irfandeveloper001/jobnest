import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { UserNav } from '../components/Nav';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

export async function loader({ request }) {
  const auth = await requireUser(request);

  try {
    const threads = await apiFetch(request, '/api/inbox/threads');
    return json({ threads, role: auth.role });
  } catch (error) {
    return json({ error: error.message, threads: null, role: auth.role }, { status: error.status || 500 });
  }
}

export default function InboxRoute() {
  const data = useLoaderData();
  const threads = data.threads?.data || [];

  return (
    <div>
      <h1>Inbox Threads</h1>
      <UserNav isAdmin={data.role === 'admin'} />

      {data.error ? <div className="banner error">{data.error}</div> : null}

      <div className="panel">
        {threads.length ? (
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>From</th>
                <th>Classification</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((thread) => (
                <tr key={thread.id}>
                  <td>{thread.subject || '(No subject)'}</td>
                  <td>{thread.from_email || '-'}</td>
                  <td><span className="badge">{thread.classification}</span></td>
                  <td><span className="badge">{thread.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No inbox threads synced yet.</div>
        )}
      </div>
    </div>
  );
}
