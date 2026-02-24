import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import AppLayout from '../components/AppLayout';
import { requireUser } from '../lib/session.server';

export async function loader({ request }) {
  const auth = await requireUser(request);
  return json({ role: auth.role });
}

export default function AppAnalyticsRoute() {
  const { role } = useLoaderData();

  return (
    <AppLayout title="Analytics" subtitle="Measure conversion rates and campaign performance." role={role}>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Analytics module placeholder. Add trend charts and channel attribution reports here.
      </section>
    </AppLayout>
  );
}
