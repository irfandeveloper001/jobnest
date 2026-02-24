import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import AppLayout from '../components/AppLayout';
import { requireUser } from '../lib/session.server';

export async function loader({ request }) {
  const auth = await requireUser(request);
  return json({ role: auth.role });
}

export default function AppSettingsRoute() {
  const { role } = useLoaderData();

  return (
    <AppLayout title="Settings" subtitle="Manage workspace preferences and notification defaults." role={role}>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Settings module placeholder. Add profile, notification, and integration controls here.
      </section>
    </AppLayout>
  );
}
