import { redirect } from '@remix-run/node';
import { apiFetch } from '../lib/api.server';
import { createUserSession } from '../lib/session.server';

export async function loader() {
  throw redirect('/auth/sign-in');
}

export async function action({ request }) {
  const formData = await request.formData();
  const idToken = String(formData.get('idToken') || '').trim();
  const name = String(formData.get('name') || '').trim();
  const mode = String(formData.get('mode') || 'sign-in').trim() === 'sign-up' ? 'sign-up' : 'sign-in';
  const fallbackPath = mode === 'sign-up' ? '/auth/sign-up' : '/auth/sign-in';

  if (!idToken) {
    throw redirect(`${fallbackPath}?error=${encodeURIComponent('Firebase token is missing.')}`);
  }

  try {
    const payload = await apiFetch(request, '/api/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify({
        idToken,
        name,
      }),
    });

    const token = payload?.token || payload?.app_token;
    const user = payload?.user || null;
    const role = user?.role || payload?.role || 'user';
    const profileCompleted = Boolean(payload?.profile_completed ?? user?.profile_completed);

    if (!token) {
      throw redirect(`${fallbackPath}?error=${encodeURIComponent('Session token not returned by API.')}`);
    }

    return createUserSession({
      request,
      token,
      role,
      user,
      redirectTo: role === 'admin' ? '/admin/dashboard' : (profileCompleted ? '/app/dashboard' : '/app/profile'),
    });
  } catch (error) {
    const message = error?.message || 'Unable to create app session.';
    throw redirect(`${fallbackPath}?error=${encodeURIComponent(message)}`);
  }
}
