import { json } from '@remix-run/node';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { AdminNav } from '../components/Nav';
import { apiFetch } from '../lib/api.server';
import { requireAdmin } from '../lib/session.server';

export async function loader({ request }) {
  await requireAdmin(request);

  try {
    const sources = await apiFetch(request, '/api/admin/job-sources');
    return json({ sources: sources.data || [] });
  } catch (error) {
    return json({ error: error.message, sources: [] }, { status: error.status || 500 });
  }
}

export async function action({ request }) {
  await requireAdmin(request);

  const formData = await request.formData();
  const id = String(formData.get('id') || '');
  const name = String(formData.get('name') || '');
  const baseUrl = String(formData.get('base_url') || '');
  const syncInterval = Number(formData.get('sync_interval_minutes') || 15);
  const enabled = formData.get('enabled') === 'on';

  try {
    await apiFetch(request, `/api/admin/job-sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        base_url: baseUrl,
        sync_interval_minutes: syncInterval,
        enabled,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    return json({ ok: true, message: `Source #${id} updated.` });
  } catch (error) {
    return json({ ok: false, error: error.message }, { status: error.status || 400 });
  }
}

export default function AdminJobSourcesRoute() {
  const data = useLoaderData();
  const actionData = useActionData();

  return (
    <div>
      <h1>Admin Job Sources</h1>
      <AdminNav />

      {data.error ? <div className="banner error">{data.error}</div> : null}
      {actionData?.ok ? <div className="banner ok">{actionData.message}</div> : null}
      {actionData?.error ? <div className="banner error">{actionData.error}</div> : null}

      <div className="panel">
        {data.sources.length ? (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Key</th>
                <th>Config</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.id}</td>
                  <td>{source.key}</td>
                  <td>
                    <Form method="post" className="grid">
                      <input type="hidden" name="id" value={source.id} />
                      <label>
                        Name
                        <input type="text" name="name" defaultValue={source.name || ''} />
                      </label>
                      <label>
                        Base URL
                        <input type="text" name="base_url" defaultValue={source.base_url || ''} />
                      </label>
                      <label>
                        Sync interval (minutes)
                        <input
                          type="number"
                          name="sync_interval_minutes"
                          min="1"
                          max="1440"
                          defaultValue={source.sync_interval_minutes || 15}
                        />
                      </label>
                      <label className="row">
                        <input type="checkbox" name="enabled" defaultChecked={Boolean(source.enabled)} />
                        Enabled
                      </label>
                      <button type="submit">Update source</button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No job sources available.</div>
        )}
      </div>
    </div>
  );
}
