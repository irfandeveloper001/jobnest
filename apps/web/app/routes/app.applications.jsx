import { json } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import AppLayout from '../components/AppLayout';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

function extractList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  let items = [];
  let error = null;

  try {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    const path = `/api/applications${search.toString() ? `?${search.toString()}` : ''}`;
    const payload = await apiFetch(request, path);
    items = extractList(payload);
  } catch (e) {
    if (e.status !== 404) {
      error = e.message || 'Unable to load applications.';
    }
  }

  return json({ role: auth.role, q, items, error });
}

export default function AppApplicationsRoute() {
  const { role, q, items, error } = useLoaderData();

  return (
    <AppLayout title="Applications" subtitle="Review sent outreach and statuses." role={role}>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <Form method="get" className="max-w-md">
          <label className="sr-only" htmlFor="applications-search">Search applications</label>
          <input
            id="applications-search"
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search applications"
            className="w-full rounded-xl border-slate-300 text-sm"
          />
        </Form>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {q ? <p className="mt-4 text-sm text-slate-600">Search query: <span className="font-semibold text-slate-900">{q}</span></p> : null}

        <div className="mt-4 space-y-3">
          {items.length ? items.map((item, index) => (
            <article key={item.id || index} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{item.title || item.job_title || 'Application'}</p>
              <p className="text-xs text-slate-600">{item.status || 'Status unavailable'}</p>
            </article>
          )) : (
            <article className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
              No applications found.
            </article>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
