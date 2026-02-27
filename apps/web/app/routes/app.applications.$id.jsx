import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

function normalizeApplication(payload, fallbackId) {
  const record = payload?.data || payload;
  if (!record || typeof record !== 'object') return null;
  return {
    id: record.id || fallbackId,
    job: record.job || null,
    full_name: record.full_name || 'Unknown applicant',
    email: record.email || 'No email',
    phone: record.phone || '—',
    cover_note: record.cover_note || '',
    status: record.status || 'submitted',
    stage: record.stage || { key: 'saved', label: 'Saved' },
    created_at: record.created_at || record.submitted_at || null,
    last_activity: record.last_activity || null,
    events: Array.isArray(record.events) ? record.events : [],
    followups: Array.isArray(record.followups) ? record.followups : [],
    available_stages: Array.isArray(record.available_stages) ? record.available_stages : [],
  };
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

function eventTitle(event) {
  const type = String(event?.type || '').toLowerCase();
  if (type === 'stage_change') {
    const from = event?.payload?.from || 'saved';
    const to = event?.payload?.to || 'saved';
    return `Stage changed: ${from} → ${to}`;
  }
  if (type === 'note') return 'Note added';
  if (type === 'followup') return 'Follow-up updated';
  if (type === 'email_sent') return 'Application email sent';
  return 'Activity';
}

function eventDescription(event) {
  if (event?.type === 'note') {
    return event?.payload?.text || '—';
  }
  if (event?.type === 'followup') {
    const dueAt = event?.payload?.due_at ? formatDate(event.payload.due_at) : '—';
    const status = event?.payload?.status || 'pending';
    return `Status: ${status} • Due: ${dueAt}`;
  }
  if (event?.type === 'email_sent') {
    const recipientCount = Number(event?.payload?.recipient_count || 0);
    return recipientCount > 0 ? `Delivered to ${recipientCount} recipient(s)` : 'Delivery confirmed';
  }
  return '';
}

export async function loader({ request, params }) {
  await requireUser(request);
  const id = params.id;
  let application = null;
  let error = null;

  try {
    const payload = await apiFetch(request, `/api/applications/${id}`);
    application = normalizeApplication(payload, id);
  } catch (fetchError) {
    error = fetchError?.message || 'Unable to load application details.';
  }

  return json({
    application,
    error,
    notice: new URL(request.url).searchParams.get('notice') || '',
  });
}

export async function action({ request, params }) {
  await requireUser(request);
  const id = params.id;
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '').trim();

  try {
    if (intent === 'change_stage') {
      const stageKey = String(formData.get('stage_key') || '').trim();
      if (!stageKey) {
        return json({ error: 'Please select a valid stage.' }, { status: 400 });
      }
      await apiFetch(request, `/api/applications/${id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage_key: stageKey }),
      });
      return redirect(`/app/applications/${id}?notice=stage-updated`);
    }

    if (intent === 'add_note') {
      const text = String(formData.get('text') || '').trim();
      if (!text) {
        return json({ error: 'Note text is required.' }, { status: 400 });
      }
      await apiFetch(request, `/api/applications/${id}/note`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      return redirect(`/app/applications/${id}?notice=note-added`);
    }

    if (intent === 'create_followup') {
      const dueAt = String(formData.get('due_at') || '').trim();
      const note = String(formData.get('followup_note') || '').trim();
      if (!dueAt) {
        return json({ error: 'Follow-up due date is required.' }, { status: 400 });
      }
      await apiFetch(request, '/api/followups', {
        method: 'POST',
        body: JSON.stringify({
          application_id: Number(id),
          due_at: dueAt,
          note: note || null,
        }),
      });
      return redirect(`/app/applications/${id}?notice=followup-added`);
    }

    return redirect(`/app/applications/${id}`);
  } catch (error) {
    return json({ error: error?.message || 'Unable to process application update.' }, { status: 400 });
  }
}

export default function ApplicationDetailsRoute() {
  const { application, error, notice } = useLoaderData();
  const actionData = useActionData();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Application Timeline</h1>
          <div className="flex items-center gap-2">
            <Link to="/app/followups" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Follow-ups
            </Link>
            <Link to="/app/applications" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Back to Applications
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {actionData?.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionData.error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice === 'stage-updated' && 'Stage updated successfully.'}
            {notice === 'note-added' && 'Note added successfully.'}
            {notice === 'followup-added' && 'Follow-up scheduled successfully.'}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">{application?.job?.title || 'Job role'}</h2>
            <p className="text-sm text-slate-600">
              {application?.job?.company || 'Unknown company'}
              {application?.job?.location ? ` • ${application.job.location}` : ''}
            </p>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Applicant</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">{application?.full_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-1 text-sm text-slate-700">{application?.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
                <dd className="mt-1 text-sm text-slate-700">{application?.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</dt>
                <dd className="mt-1 text-sm text-slate-700">{formatDate(application?.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Stage</dt>
                <dd className="mt-1 text-sm font-semibold text-emerald-700">{application?.stage?.label || 'Saved'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Status</dt>
                <dd className="mt-1 text-sm text-slate-700">{application?.status || 'submitted'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cover Note</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {application?.cover_note || 'No cover note provided.'}
                </dd>
              </div>
            </dl>

            <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Timeline</h3>
              <div className="mt-3 space-y-3">
                {application?.events?.length ? application.events.map((event) => (
                  <article key={event.id} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{eventTitle(event)}</p>
                      <p className="text-xs text-slate-500">{formatDate(event.created_at)}</p>
                    </div>
                    {eventDescription(event) ? (
                      <p className="mt-1 text-xs text-slate-600">{eventDescription(event)}</p>
                    ) : null}
                  </article>
                )) : (
                  <p className="text-sm text-slate-500">No timeline events yet.</p>
                )}
              </div>
            </section>
          </article>

          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">Change Stage</h3>
              <Form method="post" className="mt-3 space-y-2">
                <input type="hidden" name="intent" value="change_stage" />
                <select
                  name="stage_key"
                  defaultValue={application?.stage?.key || 'saved'}
                  className="w-full rounded-lg border-slate-200 py-2 text-xs focus:border-emerald-400 focus:ring-emerald-400"
                >
                  {(application?.available_stages || []).map((stage) => (
                    <option key={stage.key} value={stage.key}>{stage.label}</option>
                  ))}
                </select>
                <button type="submit" className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                  Update Stage
                </button>
              </Form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">Add Note</h3>
              <Form method="post" className="mt-3 space-y-2">
                <input type="hidden" name="intent" value="add_note" />
                <textarea
                  name="text"
                  rows={4}
                  placeholder="Add interview prep notes, feedback, or next steps..."
                  className="w-full rounded-lg border-slate-200 p-2 text-xs focus:border-emerald-400 focus:ring-emerald-400"
                />
                <button type="submit" className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                  Save Note
                </button>
              </Form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">Schedule Follow-up</h3>
              <Form method="post" className="mt-3 space-y-2">
                <input type="hidden" name="intent" value="create_followup" />
                <input
                  type="datetime-local"
                  name="due_at"
                  className="w-full rounded-lg border-slate-200 p-2 text-xs focus:border-emerald-400 focus:ring-emerald-400"
                />
                <textarea
                  name="followup_note"
                  rows={3}
                  placeholder="Optional follow-up note..."
                  className="w-full rounded-lg border-slate-200 p-2 text-xs focus:border-emerald-400 focus:ring-emerald-400"
                />
                <button type="submit" className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                  Schedule
                </button>
              </Form>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

