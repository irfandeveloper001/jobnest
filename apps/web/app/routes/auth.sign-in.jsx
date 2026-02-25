import { json } from '@remix-run/node';
import { Form, Link, useActionData } from '@remix-run/react';
import PublicLayout from '../components/PublicLayout';
import { apiFetch } from '../lib/api.server';
import { createUserSession } from '../lib/session.server';

export async function action({ request }) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  try {
    const payload = await apiFetch(request, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const user = payload?.user || payload?.data || null;
    const profileCompleted = Boolean(payload?.profile_completed ?? user?.profile_completed);

    return createUserSession({
      request,
      token: payload.token,
      role: user?.role || 'user',
      user,
      redirectTo: user?.role === 'admin' ? '/admin/dashboard' : (profileCompleted ? '/app/dashboard' : '/app/profile'),
    });
  } catch (error) {
    return json({ error: error.message || 'Unable to sign in.' }, { status: error.status || 400 });
  }
}

export default function SignInRoute() {
  const actionData = useActionData();

  return (
    <PublicLayout>
      <section className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-soft">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in to JobNest</h1>
          <p className="mt-2 text-sm text-slate-600">Access your dashboard and continue your workflow.</p>

          {actionData?.error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionData.error}
            </div>
          ) : null}

          <Form method="post" className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input name="email" type="email" required className="w-full rounded-xl border-slate-300" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <input name="password" type="password" required className="w-full rounded-xl border-slate-300" />
            </label>

            <button type="submit" className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Sign In
            </button>
          </Form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link to="/auth/forgot-password" className="font-medium text-slate-600 hover:text-slate-900">Forgot password?</Link>
            <Link to="/auth/sign-up" className="font-semibold text-primary hover:text-emerald-700">Create account</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
