import { redirect } from '@remix-run/node';
import { apiFetch } from '../lib/api.server';
import { destroySession, getSession } from '../lib/session.server';

export async function action({ request }) {
  const session = await getSession(request);

  try {
    await apiFetch(request, '/api/auth/logout', { method: 'POST' });
  } catch (_error) {
    // Ignore backend logout errors and clear local session anyway.
  }

  return redirect('/auth/sign-in', {
    headers: {
      'Set-Cookie': await destroySession(session),
    },
  });
}

export async function loader() {
  return redirect('/');
}

export default function LogoutRoute() {
  return null;
}
