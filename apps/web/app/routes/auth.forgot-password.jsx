import { json } from '@remix-run/node';
import { Form, Link, useActionData } from '@remix-run/react';
import PublicLayout from '../components/PublicLayout';

export async function action({ request }) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();

  if (!email) {
    return json({ error: 'Please provide a valid email address.' }, { status: 400 });
  }

  return json({ success: 'If your email exists, a password reset link has been prepared.' });
}

export default function ForgotPasswordRoute() {
  const actionData = useActionData();

  return (
    <PublicLayout>
      <section className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-soft">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Forgot your password?</h1>
          <p className="mt-2 text-sm text-slate-600">Enter your email and we will guide you through reset instructions.</p>

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
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input name="email" type="email" required className="w-full rounded-xl border-slate-300" />
            </label>

            <button type="submit" className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Send reset instructions
            </button>
          </Form>

          <p className="mt-4 text-sm text-slate-600">
            Remembered your credentials?{' '}
            <Link to="/auth/sign-in" className="font-semibold text-primary hover:text-emerald-700">Back to sign in</Link>
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
