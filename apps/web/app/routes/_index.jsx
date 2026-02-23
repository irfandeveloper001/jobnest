import { Form, Link } from '@remix-run/react';

export default function HomePage() {
  return (
    <div>
      <h1>JobNest</h1>
      <p className="muted">Remix frontend that talks to Laravel only from server-side loaders/actions.</p>

      <div className="panel">
        <h2>Get Started</h2>
        <div className="row">
          <Link to="/auth/sign-in">Sign in</Link>
          <Link to="/auth/sign-up">Sign up</Link>
        </div>
      </div>

      <div className="panel">
        <h3>Quick Links</h3>
        <div className="row">
          <Link to="/app/dashboard">User Dashboard</Link>
          <Link to="/admin/dashboard">Admin Dashboard</Link>
        </div>
        <Form method="post" action="/logout">
          <button className="secondary" type="submit">Logout</button>
        </Form>
      </div>
    </div>
  );
}
