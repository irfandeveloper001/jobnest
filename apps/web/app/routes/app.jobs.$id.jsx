import { json } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';
import { UserNav } from '../components/Nav';

export async function loader({ request, params }) {
  const auth = await requireUser(request);

  try {
    const payload = await apiFetch(request, `/api/jobs/${params.id}`);
    return json({ job: payload.data, role: auth.role });
  } catch (error) {
    return json({ error: error.message, job: null, role: auth.role }, { status: error.status || 500 });
  }
}

export async function action({ request, params }) {
  await requireUser(request);

  const formData = await request.formData();
  const intent = String(formData.get('intent') || 'apply');

  try {
    if (intent === 'status') {
      const status = String(formData.get('status') || 'new');
      await apiFetch(request, `/api/jobs/${params.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
        headers: { 'Content-Type': 'application/json' },
      });

      return json({ ok: true, message: 'Job status updated.' });
    }

    await apiFetch(request, '/api/applications', {
      method: 'POST',
      body: formData,
    });

    return json({ ok: true, message: 'Application submitted and queued.' });
  } catch (error) {
    return json({ ok: false, error: error.message }, { status: error.status || 400 });
  }
}

export default function JobDetailRoute() {
  const data = useLoaderData();
  const actionData = useActionData();
  const job = data.job;

  if (!job) {
    return (
      <div>
        <h1>Job</h1>
        <UserNav isAdmin={data.role === 'admin'} />
        <div className="banner error">{data.error || 'Job not found.'}</div>
        <Link to="/app/jobs">Back to jobs</Link>
      </div>
    );
  }

  return (
    <div>
      <h1>{job.title}</h1>
      <UserNav isAdmin={data.role === 'admin'} />

      {actionData?.error ? <div className="banner error">{actionData.error}</div> : null}
      {actionData?.ok ? <div className="banner ok">{actionData.message}</div> : null}

      <div className="panel">
        <p><strong>Company:</strong> {job.company_name || '-'}</p>
        <p><strong>Source:</strong> {job.source?.name || '-'}</p>
        <p><strong>Location:</strong> {job.location || '-'}</p>
        <p><strong>Status:</strong> <span className="badge">{job.status}</span></p>
        {job.url ? (
          <p>
            <a href={job.url} target="_blank" rel="noreferrer">Open original listing</a>
          </p>
        ) : null}
      </div>

      <div className="panel">
        <h2>Update Job Status</h2>
        <Form method="post" className="row">
          <input type="hidden" name="intent" value="status" />
          <select name="status" defaultValue={job.status || 'new'}>
            <option value="new">new</option>
            <option value="saved">saved</option>
            <option value="applied">applied</option>
            <option value="ignored">ignored</option>
            <option value="archived">archived</option>
          </select>
          <button className="warning" type="submit">Save status</button>
        </Form>
      </div>

      <div className="panel">
        <h2>Apply to this job</h2>
        <Form method="post" encType="multipart/form-data" className="grid">
          <input type="hidden" name="intent" value="apply" />
          <input type="hidden" name="job_id" value={job.id} />

          <label>
            Full name
            <input type="text" name="full_name" required />
          </label>

          <label>
            Email
            <input type="email" name="email" required />
          </label>

          <label>
            Phone
            <input type="text" name="phone" />
          </label>

          <label>
            Cover note
            <textarea name="cover_note" rows={5} />
          </label>

          <label>
            CV file (pdf/doc/docx, max 5MB)
            <input type="file" name="cv_file" accept=".pdf,.doc,.docx" required />
          </label>

          <button type="submit">Submit application</button>
        </Form>
      </div>
    </div>
  );
}
