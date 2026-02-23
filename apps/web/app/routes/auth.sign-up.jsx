import { Form, Link, useActionData } from '@remix-run/react';
import { json } from '@remix-run/node';
import { apiFetch } from '../lib/api.server';
import { createUserSession } from '../lib/session.server';

export async function action({ request }) {
  const formData = await request.formData();

  const name = String(formData.get('name') || '');
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  try {
    const payload = await apiFetch(request, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
      headers: { 'Content-Type': 'application/json' },
    });

    return createUserSession({
      request,
      token: payload.token,
      role: payload.user?.role || 'user',
      redirectTo: '/app/dashboard',
    });
  } catch (error) {
    return json({ error: error.message }, { status: error.status || 400 });
  }
}

export default function SignUpRoute() {
  const actionData = useActionData();

  return (
    <div className="panel">
      <h1>Create account</h1>
      {actionData?.error ? <div className="banner error">{actionData.error}</div> : null}

      <Form method="post" className="grid">
        <label>
          Name
          <input required type="text" name="name" />
        </label>
        <label>
          Email
          <input required type="email" name="email" />
        </label>
        <label>
          Password
          <input required minLength={8} type="password" name="password" />
        </label>
        <button type="submit">Create account</button>
      </Form>

      <p className="muted">
        Already registered? <Link to="/auth/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
