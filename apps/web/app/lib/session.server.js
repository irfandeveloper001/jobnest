import { createCookieSessionStorage, redirect } from '@remix-run/node';

const sessionSecret = process.env.SESSION_SECRET || 'jobnest-dev-session-secret';

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__jobnest_session',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
    sameSite: 'lax',
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === 'production',
  },
});

export async function getSession(request) {
  return sessionStorage.getSession(request.headers.get('Cookie'));
}

export async function commitSession(session) {
  return sessionStorage.commitSession(session);
}

export async function destroySession(session) {
  return sessionStorage.destroySession(session);
}

export async function createUserSession({ request, token, role, user, redirectTo }) {
  const session = await getSession(request);
  session.set('token', token);
  session.set('role', role || 'user');
  if (user && typeof user === 'object') {
    session.set('user_name', user.name || '');
    session.set('user_email', user.email || '');
    session.set('user_role', user.role || role || 'user');
  }

  throw redirect(redirectTo || '/app/dashboard', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  });
}

export async function requireUser(request) {
  const session = await getSession(request);
  const token = session.get('token');
  const role = session.get('role') || 'user';
  const userName = session.get('user_name') || '';
  const userEmail = session.get('user_email') || '';
  const userRole = session.get('user_role') || role;

  if (!token) {
    throw redirect('/auth/sign-in');
  }

  return {
    token,
    role,
    session,
    user: {
      name: userName,
      email: userEmail,
      role: userRole,
    },
  };
}

export async function requireAdmin(request) {
  const auth = await requireUser(request);
  if (auth.role !== 'admin') {
    throw redirect('/app/dashboard');
  }

  return auth;
}
