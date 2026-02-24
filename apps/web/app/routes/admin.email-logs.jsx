import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import AppLayout from '../components/AppLayout';
import { apiFetch } from '../lib/api.server';
import { requireAdmin } from '../lib/session.server';

export async function loader({ request }) {
  await requireAdmin(request);

  try {
    const logs = await apiFetch(request, '/api/admin/email-logs');
    return json({ logs, role: 'admin' });
  } catch (error) {
    return json({ logs: null, role: 'admin', error: error.message }, { status: error.status || 500 });
  }
}

export default function AdminEmailLogsRoute() {
  const data = useLoaderData();
  const logs = data.logs?.data || [];

  return (
    <AppLayout title="Email Logs" subtitle="Audit queued delivery outcomes." role={data.role}>
      {data.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{data.error}</div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {logs.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">To</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-sm text-slate-700">{log.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{log.to_email}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{log.subject}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{log.status}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{log.sent_at || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-600">No email logs available.</div>
        )}
      </section>
    </AppLayout>
  );
}
