import { Form, Link, useActionData } from '@remix-run/react';
import { json } from '@remix-run/node';
import { apiFetch } from '../lib/api.server';
import { createUserSession } from '../lib/session.server';

export async function action({ request }) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  try {
    const payload = await apiFetch(request, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json' },
    });

    return createUserSession({
      request,
      token: payload.token,
      role: payload.user?.role || 'user',
      redirectTo: payload.user?.role === 'admin' ? '/admin/dashboard' : '/app/dashboard',
    });
  } catch (error) {
    return json({ error: error.message }, { status: error.status || 400 });
  }
}

export default function SignInRoute() {
  const actionData = useActionData();

  return (
    <div className="panel">
      <h1>Sign in</h1>
      {actionData?.error ? <div className="banner error">{actionData.error}</div> : null}

      <Form method="post" className="grid">
        <label>
          Email
          <input required type="email" name="email" />
        </label>
        <label>
          Password
          <input required type="password" name="password" />
        </label>
        <button type="submit">Sign in</button>
      </Form>

      <p className="muted">
        Need an account? <Link to="/auth/sign-up">Create one</Link>
      </p>
    </div>
  );
}
