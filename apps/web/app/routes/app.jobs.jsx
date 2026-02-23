import { json } from '@remix-run/node';
import { Form, Link, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';
import { UserNav } from '../components/Nav';

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const path = query ? `/api/jobs?${query}` : '/api/jobs';

  try {
    const jobs = await apiFetch(request, path);
    return json({ jobs, role: auth.role });
  } catch (error) {
    return json({ jobs: null, error: error.message, role: auth.role }, { status: error.status || 500 });
  }
}

export default function AppJobsRoute() {
  const data = useLoaderData();
  const jobs = data.jobs?.data || [];

  return (
    <div>
      <h1>Jobs</h1>
      <UserNav isAdmin={data.role === 'admin'} />

      <div className="panel">
        <Form method="get" className="grid two">
          <label>
            Search
            <input type="text" name="q" placeholder="title, company, description" />
          </label>
          <label>
            Source
            <select name="source" defaultValue="">
              <option value="">All</option>
              <option value="arbeitnow">arbeitnow</option>
              <option value="remotive">remotive</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue="">
              <option value="">All</option>
              <option value="new">new</option>
              <option value="saved">saved</option>
              <option value="applied">applied</option>
              <option value="ignored">ignored</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label>
            Location
            <input type="text" name="location" placeholder="e.g. Berlin" />
          </label>
          <label>
            Per page
            <input type="number" name="per_page" min="1" max="100" defaultValue="15" />
          </label>
          <div className="row" style={{ alignSelf: 'end' }}>
            <button type="submit">Apply filters</button>
          </div>
        </Form>
      </div>

      {data.error ? <div className="banner error">{data.error}</div> : null}

      <div className="panel">
        {jobs.length ? (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Source</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/app/jobs/${job.id}`}>{job.title}</Link>
                    <div className="muted">{job.company_name || 'Unknown company'}</div>
                  </td>
                  <td>{job.source?.name || '-'}</td>
                  <td>{job.location || '-'}</td>
                  <td><span className="badge">{job.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No jobs found for the current filters.</div>
        )}
      </div>
    </div>
  );
}
