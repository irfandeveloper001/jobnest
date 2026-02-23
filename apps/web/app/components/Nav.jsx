import { Form, Link } from '@remix-run/react';

export function UserNav({ isAdmin = false }) {
  return (
    <div className="nav">
      <Link to="/">Home</Link>
      <Link to="/app/dashboard">Dashboard</Link>
      <Link to="/app/jobs">Jobs</Link>
      <Link to="/app/inbox">Inbox</Link>
      {isAdmin ? <Link to="/admin/dashboard">Admin</Link> : null}
      <Form method="post" action="/logout">
        <button type="submit">Logout</button>
      </Form>
    </div>
  );
}

export function AdminNav() {
  return (
    <div className="nav">
      <Link to="/">Home</Link>
      <Link to="/admin/dashboard">Admin Dashboard</Link>
      <Link to="/admin/users">Users</Link>
      <Link to="/admin/job-sources">Job Sources</Link>
      <Link to="/admin/email-logs">Email Logs</Link>
      <Link to="/app/dashboard">User Dashboard</Link>
      <Form method="post" action="/logout">
        <button type="submit">Logout</button>
      </Form>
    </div>
  );
}
