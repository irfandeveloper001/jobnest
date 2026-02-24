import { Form, useActionData } from '@remix-run/react';
import { json } from '@remix-run/node';
import PublicLayout from '../components/PublicLayout';

export async function action({ request }) {
  const formData = await request.formData();
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const message = String(formData.get('message') || '').trim();

  if (!name || !email || !message) {
    return json({ error: 'Please fill in all required fields.' }, { status: 400 });
  }

  return json({ success: 'Thanks! We received your request and will get back shortly.' });
}

export default function ContactRoute() {
  const actionData = useActionData();

  return (
    <PublicLayout>
      <section className="mx-auto w-full max-w-[1200px] px-3 py-16 sm:px-6 xl:px-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Contact</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Talk to the JobNest team</h1>
        <p className="mt-3 text-slate-600">Share your goals and we will help you structure the ideal workflow.</p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          {actionData?.error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionData.error}
            </div>
          ) : null}

          {actionData?.success ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {actionData.success}
            </div>
          ) : null}

          <Form method="post" className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Name</span>
              <input name="name" type="text" required className="w-full rounded-xl border-slate-300" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input name="email" type="email" required className="w-full rounded-xl border-slate-300" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Message</span>
              <textarea name="message" rows={5} required className="w-full rounded-xl border-slate-300" />
            </label>
            <button type="submit" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Send message
            </button>
          </Form>
        </div>
      </section>
    </PublicLayout>
  );
}
