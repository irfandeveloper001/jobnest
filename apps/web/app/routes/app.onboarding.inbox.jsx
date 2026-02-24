import { json } from '@remix-run/node';
import { Link } from '@remix-run/react';
import { requireUser } from '../lib/session.server';

export async function loader({ request }) {
  await requireUser(request);
  return json({});
}

export default function AppOnboardingInboxRoute() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Onboarding: Inbox</h1>
        <p className="mt-2 text-sm text-slate-600">Inbox step placeholder. Your CV step redirects here correctly.</p>
        <Link to="/app/inbox" className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white">
          Open Inbox Monitor
        </Link>
      </div>
    </div>
  );
}
