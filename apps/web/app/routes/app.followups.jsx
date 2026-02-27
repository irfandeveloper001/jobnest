import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const STATUS_OPTIONS = ['all', 'pending', 'done', 'snoozed'];

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeStatus(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return STATUS_OPTIONS.includes(normalized) ? normalized : 'all';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function buildQuery(filters, patch = {}) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.status !== 'all') params.set('status', next.status);
  params.set('page', String(next.page));
  params.set('per_page', String(next.per_page));
  return params;
}

export async function loader({ request }) {
  await requireUser(request);
  const url = new URL(request.url);

  const filters = {
    q: (url.searchParams.get('q') || '').trim(),
    status: normalizeStatus(url.searchParams.get('status')),
    page: toPositiveInt(url.searchParams.get('page'), 1),
    per_page: toPositiveInt(url.searchParams.get('per_page'), 10),
  };

  let followups = [];
  let meta = {
    page: filters.page,
    per_page: filters.per_page,
    total: 0,
    last_page: 1,
  };
  let error = null;

  try {
    const payload = await apiFetch(request, `/api/followups?${buildQuery(filters).toString()}`);
    followups = Array.isArray(payload?.data) ? payload.data : [];
    meta = {
      page: toPositiveInt(payload?.meta?.page, filters.page),
      per_page: toPositiveInt(payload?.meta?.per_page, filters.per_page),
      total: toPositiveInt(payload?.meta?.total, followups.length),
      last_page: Math.max(1, toPositiveInt(payload?.meta?.last_page, 1)),
    };
  } catch (fetchError) {
    error = fetchError?.message || 'Unable to load follow-ups.';
  }

  return json({
    followups,
    meta,
    filters,
    error,
    notice: url.searchParams.get('notice') || '',
  });
}

export async function action({ request }) {
  await requireUser(request);
  const formData = await request.formData();
  const id = String(formData.get('id') || '').trim();
  const status = String(formData.get('status') || '').trim().toLowerCase();
  const dueAt = String(formData.get('due_at') || '').trim();
  const q = String(formData.get('q') || '').trim();
  const currentStatus = normalizeStatus(formData.get('current_status'));
  const page = toPositiveInt(formData.get('page'), 1);
  const perPage = toPositiveInt(formData.get('per_page'), 10);

  if (!id) {
    return json({ error: 'Follow-up id is required.' }, { status: 400 });
  }

  try {
    await apiFetch(request, `/api/followups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: status || undefined,
        due_at: dueAt || undefined,
      }),
    });

    const params = buildQuery({
      q,
      status: currentStatus,
      page,
      per_page: perPage,
    });
    params.set('notice', 'updated');
    return redirect(`/app/followups?${params.toString()}`);
  } catch (error) {
    return json({ error: error?.message || 'Unable to update follow-up.' }, { status: 400 });
  }
}

export default function FollowupsRoute() {
  const { followups, filters, meta, error, notice } = useLoaderData();
  const actionData = useActionData();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Follow-ups</h1>
            <p className="text-sm text-slate-500">Track due actions and mark progress quickly.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/app/applications" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Applications
            </Link>
            <Link to="/app/dashboard" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Dashboard
            </Link>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <Form method="get" className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              name="q"
              defaultValue={filters.q}
              placeholder="Search by job/company/applicant/email"
              className="rounded-lg border-slate-200 py-2 px-3 text-xs focus:border-emerald-400 focus:ring-emerald-400"
            />
            <select
              name="status"
              defaultValue={filters.status}
              className="rounded-lg border-slate-200 py-2 px-3 text-xs focus:border-emerald-400 focus:ring-emerald-400"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
              <option value="snoozed">Snoozed</option>
            </select>
            <button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
              Apply
            </button>
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="per_page" value={String(filters.per_page)} />
          </Form>
        </section>

        {notice === 'updated' ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Follow-up updated successfully.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : null}
        {actionData?.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionData.error}</div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Application</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Due</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Note</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {followups.map((followup) => (
                  <tr key={followup.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {followup?.application?.job?.title || 'Application'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {followup?.application?.job?.company || 'Unknown company'} • {followup?.application?.full_name || 'Applicant'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{formatDate(followup.due_at)}</td>
                    <td className="px-4 py-3 text-xs font-semibold capitalize text-slate-700">{followup.status}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{followup.note || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Form method="post">
                          <input type="hidden" name="id" value={followup.id} />
                          <input type="hidden" name="status" value="done" />
                          <input type="hidden" name="q" value={filters.q} />
                          <input type="hidden" name="current_status" value={filters.status} />
                          <input type="hidden" name="page" value={meta.page} />
                          <input type="hidden" name="per_page" value={meta.per_page} />
                          <button type="submit" className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                            Mark Done
                          </button>
                        </Form>
                        <Form method="post">
                          <input type="hidden" name="id" value={followup.id} />
                          <input type="hidden" name="status" value="snoozed" />
                          <input type="hidden" name="q" value={filters.q} />
                          <input type="hidden" name="current_status" value={filters.status} />
                          <input type="hidden" name="page" value={meta.page} />
                          <input type="hidden" name="per_page" value={meta.per_page} />
                          <button type="submit" className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                            Snooze
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!followups.length ? (
            <div className="border-t border-slate-100 px-4 py-10 text-center">
              <p className="text-lg font-bold text-slate-900">No follow-ups due</p>
              <p className="mt-2 text-sm text-slate-500">Create a follow-up from an application details page.</p>
              <Link to="/app/applications" className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                Open Applications
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

