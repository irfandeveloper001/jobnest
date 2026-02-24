import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

function clampProgress(value, fallback = 40) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function mapStepToProgress(step) {
  const key = String(step || '').toLowerCase();
  const map = { profile: 20, cv: 40, inbox: 60, jobs: 80, finish: 100 };
  return map[key] || 40;
}

function normalizeCv(payload) {
  if (!payload) return null;
  const data = payload?.data || payload?.cv || payload;
  if (!data || typeof data !== 'object') return null;

  const sizeBytes = Number(data.size_bytes || data.size || 0);
  return {
    filename: data.filename || data.name || null,
    size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    uploaded_at: data.uploaded_at || data.created_at || null,
  };
}

function formatSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '0 MB';
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function hasFile(file) {
  return Boolean(file && typeof file === 'object' && 'size' in file && file.size > 0);
}

async function loadExistingCv(request) {
  try {
    const payload = await apiFetch(request, '/api/documents/cv');
    return normalizeCv(payload);
  } catch {
    return null;
  }
}

async function uploadCv(request, file) {
  const payload = new FormData();
  payload.set('cv_file', file);
  await apiFetch(request, '/api/documents/cv', {
    method: 'POST',
    body: payload,
  });
}

export async function loader({ request }) {
  await requireUser(request);
  let progress = 40;

  try {
    const payload = await apiFetch(request, '/api/onboarding');
    const data = payload?.data || payload || {};
    progress = data.progress != null ? clampProgress(data.progress, 40) : mapStepToProgress(data.step);
  } catch {
    progress = 40;
  }

  const cv = await loadExistingCv(request);

  return json({
    progress,
    currentStep: 'cv',
    cv,
  });
}

export async function action({ request }) {
  await requireUser(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '').toLowerCase();
  const cvFile = formData.get('cv_file');

  try {
    if (intent === 'back') {
      return redirect('/app/onboarding/profile');
    }

    if (intent === 'skip') {
      return redirect('/app/onboarding/inbox');
    }

    if (intent === 'delete') {
      await apiFetch(request, '/api/documents/cv', { method: 'DELETE' });
      return redirect('/app/onboarding/cv');
    }

    if (intent === 'upload') {
      if (!hasFile(cvFile)) {
        return json({ error: 'Please select a CV file first.' }, { status: 400 });
      }
      await uploadCv(request, cvFile);
      return redirect('/app/onboarding/inbox');
    }

    if (intent === 'continue') {
      if (hasFile(cvFile)) {
        await uploadCv(request, cvFile);
        return redirect('/app/onboarding/inbox');
      }

      const existing = await loadExistingCv(request);
      if (existing?.filename) {
        return redirect('/app/onboarding/inbox');
      }

      return json({ error: 'Upload your CV or click "Skip for now".' }, { status: 400 });
    }

    return json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error) {
    return json({ error: error?.message || 'Unable to process this step.' }, { status: error?.status || 400 });
  }
}

export default function AppOnboardingCvRoute() {
  const { progress, cv } = useLoaderData();
  const actionData = useActionData();
  const cvExists = Boolean(cv?.filename);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-[#0b1a2d]">
              <span className="material-symbols-outlined text-lg">rocket_launch</span>
            </div>
            <p className="text-2xl font-black leading-none">jobnest</p>
          </div>
          <div className="flex items-center gap-4">
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600">
              <span className="material-symbols-outlined text-sm">help</span>
            </button>
            <div className="h-7 w-px bg-slate-200" />
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
              <span className="material-symbols-outlined text-base">account_circle</span>
              Guest User
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="relative mb-8">
          <div className="absolute left-0 right-0 top-5 h-0.5 rounded-full bg-slate-200" />
          <div className="absolute left-0 top-5 h-0.5 rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
          <div className="relative grid grid-cols-5 gap-2 text-center">
            <div className="space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                <span className="material-symbols-outlined text-sm">check</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">Profile</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-[5px] border-emerald-500/30 bg-emerald-500 text-white">
                <span className="material-symbols-outlined text-sm">description</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-800">CV</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400">
                <span className="material-symbols-outlined text-sm">chat</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Inbox</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400">
                <span className="material-symbols-outlined text-sm">work</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Jobs</p>
            </div>
            <div className="space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400">
                <span className="material-symbols-outlined text-sm">flag</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Finish</p>
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-center text-4xl font-black tracking-tight">Step 2: Upload your CV</h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-xl text-slate-500">
            We&apos;ll use your CV to automatically populate your profile and match you with the best career opportunities.
          </p>

          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-2xl font-bold">Overall Progress</p>
              <p className="text-2xl font-bold text-emerald-500">{progress}%</p>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-200">
              <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {actionData?.error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionData.error}</div>
          ) : null}

          <Form method="post" encType="multipart/form-data" className="mt-7">
            <div className="rounded-2xl border-2 border-dashed border-[#8af0ac] bg-[#eef8f2] px-6 py-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#bdeed0] text-emerald-500">
                <span className="material-symbols-outlined text-3xl">upload_file</span>
              </div>
              <h2 className="mt-5 text-4xl font-bold">Drag and drop your CV here</h2>
              <p className="mt-2 text-lg text-slate-500">Supported formats: <span className="font-semibold text-slate-700">PDF, DOCX, TXT</span> (Max 5MB)</p>
              <div className="mt-6">
                <label className="relative inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#0f1c3d] px-6 py-3 text-lg font-bold text-white hover:bg-[#132652]">
                  Select File from Device
                  <input type="file" name="cv_file" accept=".pdf,.doc,.docx,.txt" className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            </div>

            {cvExists ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Selected File Preview</p>
                    <p className="text-sm text-slate-700">{cv.filename}</p>
                    <p className="text-xs text-slate-500">{formatSize(cv.size_bytes)}</p>
                  </div>
                  <button type="submit" name="intent" value="delete" className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="submit" name="intent" value="back" className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-600 hover:text-slate-900">
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                Back
              </button>
              <div className="flex items-center gap-3">
                <button type="submit" name="intent" value="skip" className="rounded-xl px-4 py-2 text-2xl font-semibold text-slate-600 hover:text-slate-900">
                  Skip for now
                </button>
                <button type="submit" name="intent" value="continue" className="rounded-xl bg-emerald-500 px-7 py-2.5 text-2xl font-bold text-[#0b1b2a] shadow-[0_10px_20px_rgba(17,212,89,0.3)] hover:bg-emerald-600">
                  Continue
                </button>
              </div>
            </div>
          </Form>
        </section>

        <div className="mt-8 flex items-center justify-center gap-8 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">lock</span>
            End-to-end encrypted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">verified_user</span>
            GDPR compliant
          </span>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2024 User App Inc. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link to="#" className="hover:text-slate-700">Privacy Policy</Link>
            <Link to="#" className="hover:text-slate-700">Terms of Service</Link>
            <Link to="#" className="hover:text-slate-700">Contact Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
