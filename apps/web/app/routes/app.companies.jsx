import { json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { requireUser } from '../lib/session.server';

export async function loader({ request }) {
  const auth = await requireUser(request);
  return json({ user: auth.user || null });
}

export default function AppCompaniesRoute() {
  const { user } = useLoaderData();

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Companies</h1>
        <p className="mt-2 text-sm text-slate-600">
          Coming soon. This area will help {user?.name || 'you'} manage companies and hiring contacts.
        </p>
        <Link to="/app/jobs" className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
          Back to Jobs
        </Link>
      </div>
    </div>
  );
}
