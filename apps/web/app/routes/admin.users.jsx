import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import AppLayout from '../components/AppLayout';
import { apiFetch } from '../lib/api.server';
import { requireAdmin } from '../lib/session.server';

export async function loader({ request }) {
  await requireAdmin(request);

  try {
    const users = await apiFetch(request, '/api/admin/users');
    return json({ users, role: 'admin' });
  } catch (error) {
    return json({ users: null, role: 'admin', error: error.message }, { status: error.status || 500 });
  }
}

export default function AdminUsersRoute() {
  const data = useLoaderData();
  const users = data.users?.data || [];

  return (
    <AppLayout title="Users" subtitle="Manage user access and role distribution." role={data.role}>
      {data.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{data.error}</div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {users.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-sm text-slate-700">{user.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{user.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-600">No users available.</div>
        )}
      </section>
    </AppLayout>
  );
}
