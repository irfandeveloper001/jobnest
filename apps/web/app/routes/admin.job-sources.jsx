import { json } from '@remix-run/node';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import AppLayout from '../components/AppLayout';
import { apiFetch } from '../lib/api.server';
import { requireAdmin } from '../lib/session.server';

export async function loader({ request }) {
  await requireAdmin(request);

  try {
    const sources = await apiFetch(request, '/api/admin/job-sources');
    return json({ sources: sources.data || [], role: 'admin' });
  } catch (error) {
    return json({ sources: [], role: 'admin', error: error.message }, { status: error.status || 500 });
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        base_url: baseUrl,
        sync_interval_minutes: syncInterval,
        enabled,
      }),
    });

    return json({ success: `Source #${id} updated.` });
  } catch (error) {
    return json({ error: error.message || 'Update failed.' }, { status: error.status || 400 });
  }
}

export default function AdminJobSourcesRoute() {
  const data = useLoaderData();
  const actionData = useActionData();

  return (
    <AppLayout title="Job Sources" subtitle="Configure source availability and sync cadence." role={data.role}>
      {data.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{data.error}</div>
      ) : null}
      {actionData?.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionData.error}</div>
      ) : null}
      {actionData?.success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{actionData.success}</div>
      ) : null}

      <section className="space-y-4">
        {data.sources.length ? data.sources.map((source) => (
          <article key={source.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{source.name}</h2>
                <p className="text-sm text-slate-500">Key: {source.key}</p>
              </div>
            </div>

            <Form method="post" className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={source.id} />

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
                <input name="name" type="text" defaultValue={source.name || ''} className="w-full rounded-xl border-slate-300" />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Sync interval (minutes)</span>
                <input
                  name="sync_interval_minutes"
                  type="number"
                  min="1"
                  max="1440"
                  defaultValue={source.sync_interval_minutes || 15}
                  className="w-full rounded-xl border-slate-300"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">Base URL</span>
                <input name="base_url" type="text" defaultValue={source.base_url || ''} className="w-full rounded-xl border-slate-300" />
              </label>

              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input name="enabled" type="checkbox" defaultChecked={Boolean(source.enabled)} className="rounded border-slate-300" />
                Enabled
              </label>

              <div className="sm:col-span-2">
                <button type="submit" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
                  Update Source
                </button>
              </div>
            </Form>
          </article>
        )) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No job sources available.</div>
        )}
      </section>
    </AppLayout>
  );
}
