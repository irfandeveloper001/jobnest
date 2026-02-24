import { json } from '@remix-run/node';
import { Form, Link, useActionData } from '@remix-run/react';
import PublicLayout from '../components/PublicLayout';

export async function action({ request }) {
  const formData = await request.formData();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirm_password') || '');

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return json({ error: 'Passwords do not match.' }, { status: 400 });
  }

  return json({ success: 'Password reset form accepted. Please sign in with your new password.' });
}

export default function ResetPasswordRoute() {
  const actionData = useActionData();

  return (
    <PublicLayout>
      <section className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-soft">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Reset password</h1>
          <p className="mt-2 text-sm text-slate-600">Set a new password to secure your account.</p>

          {actionData?.error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionData.error}
            </div>
          ) : null}
          {actionData?.success ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {actionData.success}
            </div>
          ) : null}

          <Form method="post" className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">New password</span>
              <input name="password" type="password" minLength={8} required className="w-full rounded-xl border-slate-300" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Confirm password</span>
              <input name="confirm_password" type="password" minLength={8} required className="w-full rounded-xl border-slate-300" />
            </label>
            <button type="submit" className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Save new password
            </button>
          </Form>

          <p className="mt-4 text-sm text-slate-600">
            Back to{' '}
            <Link to="/auth/sign-in" className="font-semibold text-primary hover:text-emerald-700">Sign in</Link>
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
