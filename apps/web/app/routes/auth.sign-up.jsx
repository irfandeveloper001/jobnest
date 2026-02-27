import { useState } from 'react';
import { Link, useNavigation, useSearchParams, useSubmit } from '@remix-run/react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import PublicLayout from '../components/PublicLayout';
import { getFirebaseAuth } from '../lib/firebase.client';

function getFirebaseMessage(error) {
  const code = String(error?.code || '');
  const map = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
    'auth/network-request-failed': 'Network issue while contacting Firebase.',
  };
  return map[code] || error?.message || 'Unable to create account.';
}

export default function SignUpRoute() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [clientError, setClientError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setClientError('');
    setIsSigningUp(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    try {
      const auth = getFirebaseAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        await updateProfile(credential.user, { displayName: name });
      }
      const idToken = await credential.user.getIdToken(true);

      const sessionPayload = new FormData();
      sessionPayload.set('idToken', idToken);
      sessionPayload.set('name', name);
      sessionPayload.set('mode', 'sign-up');
      submit(sessionPayload, { method: 'post', action: '/auth/session' });
    } catch (error) {
      setClientError(getFirebaseMessage(error));
      setIsSigningUp(false);
    }
  }

  const queryError = String(searchParams.get('error') || '');
  const errorMessage = clientError || queryError;
  const submitting = isSigningUp || navigation.state !== 'idle';

  return (
    <PublicLayout>
      <section className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-soft">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Create your JobNest account</h1>
          <p className="mt-2 text-sm text-slate-600">Start tracking opportunities in minutes.</p>

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <form method="post" onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Full name</span>
              <input name="name" type="text" required className="w-full rounded-xl border-slate-300" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input name="email" type="email" required className="w-full rounded-xl border-slate-300" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
              <input name="password" type="password" minLength={8} required className="w-full rounded-xl border-slate-300" />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating account...' : 'Get Started Free'}
            </button>
          </form>

          <p className="mt-4 text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/auth/sign-in" className="font-semibold text-primary hover:text-emerald-700">Sign in</Link>
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
