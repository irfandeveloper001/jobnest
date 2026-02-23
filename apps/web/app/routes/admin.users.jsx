import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { AdminNav } from '../components/Nav';
import { apiFetch } from '../lib/api.server';
import { requireAdmin } from '../lib/session.server';

export async function loader({ request }) {
  await requireAdmin(request);

  try {
    const users = await apiFetch(request, '/api/admin/users');
    return json({ users });
  } catch (error) {
    return json({ error: error.message, users: null }, { status: error.status || 500 });
  }
}

export default function AdminUsersRoute() {
  const data = useLoaderData();
  const users = data.users?.data || [];

  return (
    <div>
      <h1>Admin Users</h1>
      <AdminNav />

      {data.error ? <div className="banner error">{data.error}</div> : null}

      <div className="panel">
        {users.length ? (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td><span className="badge">{user.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No users available.</div>
        )}
      </div>
    </div>
  );
}
