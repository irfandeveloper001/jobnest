import { json } from '@remix-run/node';
import { Link } from '@remix-run/react';
import { requireUser } from '../lib/session.server';

export async function loader({ request }) {
  await requireUser(request);
  return json({});
}

export default function AppEmailsSentRoute() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-black text-slate-900">Sent Emails</h1>
        <p className="mt-2 text-sm text-slate-600">Delivery logs and sent mail history will be displayed here.</p>
        <Link to="/app/emails/templates" className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white">
          Back to Templates
        </Link>
      </div>
    </div>
  );
}
