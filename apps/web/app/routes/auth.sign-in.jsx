import { useState } from 'react';
import { Link, useNavigation, useSearchParams, useSubmit } from '@remix-run/react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import PublicLayout from '../components/PublicLayout';
import { getFirebaseAuth } from '../lib/firebase.client';

function getFirebaseMessage(error) {
  const code = String(error?.code || '');
  const map = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/user-not-found': 'No account found for this email.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network issue while contacting Firebase.',
  };
  return map[code] || error?.message || 'Unable to sign in.';
}

export default function SignInRoute() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [clientError, setClientError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setClientError('');
    setIsAuthenticating(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      const sessionPayload = new FormData();
      sessionPayload.set('idToken', idToken);
      sessionPayload.set('mode', 'sign-in');
      submit(sessionPayload, { method: 'post', action: '/auth/session' });
    } catch (error) {
      setClientError(getFirebaseMessage(error));
      setIsAuthenticating(false);
    }
  }

  const queryError = String(searchParams.get('error') || '');
  const errorMessage = clientError || queryError;
  const submitting = isAuthenticating || navigation.state !== 'idle';

  return (
    <PublicLayout>
      <section className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-soft">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in to JobNest</h1>
          <p className="mt-2 text-sm text-slate-600">Access your dashboard and continue your workflow.</p>

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <form method="post" onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input name="email" type="email" required className="w-full rounded-xl border-slate-300" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <input name="password" type="password" required className="w-full rounded-xl border-slate-300" />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link to="/auth/forgot-password" className="font-medium text-slate-600 hover:text-slate-900">Forgot password?</Link>
            <Link to="/auth/sign-up" className="font-semibold text-primary hover:text-emerald-700">Create account</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
