import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const TAB_KEYS = ['description', 'requirements', 'responsibilities', 'benefits'];

function normalizeTab(value) {
  const tab = String(value || 'description').toLowerCase();
  return TAB_KEYS.includes(tab) ? tab : 'description';
}

function splitContent(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  const byLine = raw
    .split('\n')
    .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean);

  if (byLine.length > 1) return byLine;

  const bySentence = raw
    .split(/[.;]\s+/)
    .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean);

  return bySentence.length ? bySentence : fallback;
}

function normalizeJob(payload, fallbackId) {
  const raw = payload?.data || payload?.job || payload;
  if (!raw || typeof raw !== 'object') return null;

  const companyObject = raw.company && typeof raw.company === 'object' ? raw.company : null;
  const sourceObject = raw.source && typeof raw.source === 'object' ? raw.source : null;

  return {
    id: raw.id || fallbackId,
    title: raw.title || raw.job_title || 'Senior Frontend Engineer',
    company: raw.company || raw.company_name || companyObject?.name || 'TechFlow Systems',
    location: raw.location || null,
    employment_type: raw.employment_type || raw.type || null,
    salary_range: raw.salary_range || raw.salary || raw.compensation || null,
    description: raw.description || raw.summary || null,
    requirements: raw.requirements || null,
    responsibilities: raw.responsibilities || null,
    benefits: raw.benefits || null,
    source: raw.source || sourceObject?.name || null,
    status: raw.status || null,
    website: companyObject?.website || raw.website || null,
    company_size: companyObject?.company_size || raw.company_size || null,
  };
}

function normalizeApplicationStatus(payload, fallbackStatus) {
  const inferredApplied = String(fallbackStatus || '').toLowerCase() === 'applied';
  const defaultResult = {
    applied: inferredApplied,
    status: inferredApplied ? 'applied' : 'not_started',
  };

  if (!payload) return defaultResult;

  const data = payload?.data || payload;

  if (Array.isArray(data)) {
    if (!data.length) return defaultResult;
    const latest = data[0] || {};
    const status = String(latest.status || '').toLowerCase() || (inferredApplied ? 'applied' : 'not_started');
    return {
      applied: status === 'applied' || inferredApplied,
      status,
    };
  }

  if (typeof data === 'object') {
    if (typeof data.applied === 'boolean') {
      return {
        applied: data.applied || inferredApplied,
        status: String(data.status || (data.applied ? 'applied' : 'not_started')).toLowerCase(),
      };
    }

    const status = String(data.status || data.application_status || '').toLowerCase();
    if (status) {
      return {
        applied: status === 'applied' || inferredApplied,
        status,
      };
    }
  }

  return defaultResult;
}

function buildJobDetailHref(id, options = {}) {
  const params = new URLSearchParams();
  const tab = normalizeTab(options.tab || 'description');
  if (tab !== 'description') params.set('tab', tab);
  if (options.apply) params.set('apply', '1');
  if (options.applied) params.set('applied', '1');
  const query = params.toString();
  return `/app/jobs/${id}${query ? `?${query}` : ''}`;
}

export async function loader({ request, params }) {
  const auth = await requireUser(request);
  const id = params.id;
  const url = new URL(request.url);
  const tab = normalizeTab(url.searchParams.get('tab'));
  const showApplyForm = url.searchParams.get('apply') === '1';
  const appliedNotice = url.searchParams.get('applied') === '1';

  let job = null;
  let applicationStatus = { applied: false, status: 'not_started' };
  let error = null;

  try {
    const payload = await apiFetch(request, `/api/jobs/${id}`);
    job = normalizeJob(payload, id);
  } catch (e) {
    error = e?.message || 'Unable to load job details.';
  }

  if (job) {
    try {
      const statusPayload = await apiFetch(request, `/api/applications/by-job/${id}`);
      applicationStatus = normalizeApplicationStatus(statusPayload, job.status);
    } catch (e) {
      applicationStatus = normalizeApplicationStatus(null, job.status);
    }
  }

  return json({
    user: auth.user || null,
    tab,
    showApplyForm,
    appliedNotice,
    job,
    applicationStatus,
    error,
  });
}

export async function action({ request, params }) {
  await requireUser(request);
  const id = params.id;
  const formData = await request.formData();
  const tab = normalizeTab(formData.get('tab'));

  const fullName = String(formData.get('full_name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const coverNote = String(formData.get('cover_note') || '').trim();
  const cvFile = formData.get('cv_file');

  if (!fullName || !email) {
    return json({ error: 'Full name and email are required.' }, { status: 400 });
  }

  if (!(cvFile && typeof cvFile === 'object' && 'size' in cvFile && cvFile.size > 0)) {
    return json({ error: 'CV file is required.' }, { status: 400 });
  }

  try {
    const payload = new FormData();
    payload.set('job_id', String(id));
    payload.set('full_name', fullName);
    payload.set('email', email);
    if (phone) payload.set('phone', phone);
    if (coverNote) payload.set('cover_note', coverNote);
    payload.set('cv_file', cvFile);

    await apiFetch(request, '/api/applications', {
      method: 'POST',
      body: payload,
    });

    return redirect(buildJobDetailHref(id, { tab, applied: true }));
  } catch (e) {
    return json({ error: e?.message || 'Unable to submit application. Please try again.' }, { status: e?.status || 400 });
  }
}

export default function AppJobDetailsRoute() {
  const { job, applicationStatus, tab, showApplyForm, appliedNotice, error } = useLoaderData();
  const actionData = useActionData();

  const fallbackDescription = "We are looking for a Senior Frontend Engineer to join our core product team. You will be responsible for building high-quality, scalable web applications using React, Tailwind CSS, and TypeScript. You'll collaborate closely with designers and product managers to deliver exceptional user experiences that redefine how people find their next career move.";
  const fallbackResponsibilities = [
    'Design and implement complex frontend architectures for our flagship platform.',
    'Optimize application performance and ensure high responsiveness across devices.',
    'Collaborate with backend engineers to integrate RESTful and GraphQL APIs.',
    'Mentor junior and mid-level developers through code reviews and pair programming.',
  ];
  const fallbackRequirements = [
    '5+ years React experience',
    'Expert TypeScript',
    'Tailwind CSS mastery',
    'System design skills',
  ];
  const fallbackBenefits = [
    'Remote-friendly culture and flexible hours.',
    'Health, dental, and vision benefits package.',
    'Annual learning budget and conference support.',
    'High-impact ownership with fast decision cycles.',
  ];

  const isApplied = Boolean(applicationStatus?.applied);
  const activeTab = normalizeTab(tab);
  const tabContentMap = {
    description: splitContent(job?.description, [fallbackDescription]),
    requirements: splitContent(job?.requirements, fallbackRequirements),
    responsibilities: splitContent(job?.responsibilities, fallbackResponsibilities),
    benefits: splitContent(job?.benefits, fallbackBenefits),
  };
  const activeContent = tabContentMap[activeTab];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1300px] items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-6">
            <Link to="/app/dashboard" className="flex items-center gap-3">
              <span className="material-symbols-outlined text-lg text-emerald-500">work</span>
              <span className="text-2xl font-black uppercase leading-none tracking-tight">jobnest</span>
            </Link>
            <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 lg:flex">
              <Link to="/app/jobs" className="hover:text-slate-900">Find Jobs</Link>
              <Link to="/app/companies" className="hover:text-slate-900">Companies</Link>
              <Link to="/app/applications" className="border-b-4 border-emerald-500 pb-1 text-slate-900">My Applications</Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Form method="get" action="/app/jobs" className="relative hidden lg:block">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-400">
                search
              </span>
              <input
                type="text"
                name="q"
                placeholder="Search roles..."
                className="h-10 w-[280px] rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
              />
            </Form>
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
              <span className="material-symbols-outlined text-base">notifications</span>
            </button>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-50 text-xs font-bold text-emerald-700">
              {job?.company?.slice(0, 1)?.toUpperCase() || 'J'}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 lg:px-6">
        {error ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg text-red-700">{error}</div>
        ) : null}

        {appliedNotice ? (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-lg text-emerald-700">
            Application submitted successfully.
          </div>
        ) : null}

        {job ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
            <section>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <Link to="/app/jobs" className="hover:text-slate-800">Jobs</Link>
                    <span>›</span>
                    <Link to="/app/jobs?category=engineering" className="hover:text-slate-800">Engineering</Link>
                    <span>›</span>
                    <span className="truncate text-slate-800">{job.title}</span>
                  </nav>
                  <h1 className="text-4xl font-black leading-tight text-slate-900 md:text-5xl">{job.title}</h1>
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-lg text-slate-700">
                    <span className="inline-flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-emerald-500">location_on</span>
                      {job.location || 'Remote / New York'}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-emerald-500">schedule</span>
                      {job.employment_type || 'Full-time'}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="material-symbols-outlined text-xl text-emerald-500">payments</span>
                      {job.salary_range || '$140k - $180k'}
                    </span>
                  </div>
                </div>

                {isApplied ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-12 min-w-[180px] items-center justify-center rounded-xl bg-emerald-100 px-5 text-sm font-bold text-emerald-700"
                  >
                    Applied
                  </button>
                ) : (
                  <Link
                    to={buildJobDetailHref(job.id, { tab: activeTab, apply: true })}
                    className="inline-flex h-12 min-w-[180px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-white shadow-[0_10px_20px_rgba(17,212,89,0.25)] hover:bg-emerald-600"
                  >
                    Apply Now
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </Link>
                )}
              </div>

              <div className="mt-7 border-b border-slate-200">
                <div className="flex flex-wrap items-end gap-6 text-sm font-medium">
                  {TAB_KEYS.map((tabKey) => (
                    <Link
                      key={tabKey}
                      to={buildJobDetailHref(job.id, { tab: tabKey, apply: showApplyForm && !isApplied })}
                      className={tabKey === activeTab
                        ? 'border-b-4 border-emerald-500 pb-3 font-semibold text-slate-900'
                        : 'pb-3 text-slate-500 hover:text-slate-800'}
                    >
                      {tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}
                    </Link>
                  ))}
                </div>
              </div>

              {showApplyForm && !isApplied ? (
                <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-2xl font-bold text-slate-900">Apply to {job.title}</h2>
                    <Link
                      to={buildJobDetailHref(job.id, { tab: activeTab })}
                      className="text-base font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Close
                    </Link>
                  </div>

                  {actionData?.error ? (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
                      {actionData.error}
                    </div>
                  ) : null}

                  <Form method="post" encType="multipart/form-data" className="grid gap-4 md:grid-cols-2">
                    <input type="hidden" name="tab" value={activeTab} />

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">Full name</span>
                      <input name="full_name" type="text" required className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm focus:border-emerald-500 focus:outline-none" />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
                      <input name="email" type="email" required className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm focus:border-emerald-500 focus:outline-none" />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">Phone</span>
                      <input name="phone" type="text" className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm focus:border-emerald-500 focus:outline-none" />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">CV file</span>
                      <input name="cv_file" type="file" accept=".pdf,.doc,.docx" required className="h-14 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs" />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">Cover note</span>
                      <textarea name="cover_note" rows={4} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none" />
                    </label>

                    <div className="md:col-span-2">
                      <button type="submit" className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-500 px-6 text-sm font-bold text-white hover:bg-emerald-600">
                        Submit Application
                      </button>
                    </div>
                  </Form>
                </section>
              ) : null}

              <section className="mt-8">
                {activeTab === 'description' ? (
                  <>
                    <h2 className="text-2xl font-bold text-slate-900">About the Role</h2>
                    <div className="mt-4 space-y-3 text-base leading-relaxed text-slate-700">
                      {activeContent.map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>

                    <h3 className="mt-8 text-2xl font-bold text-slate-900">Key Responsibilities</h3>
                    <ul className="mt-4 space-y-4">
                      {splitContent(job.responsibilities, fallbackResponsibilities).map((item, index) => (
                        <li key={index} className="flex items-start gap-3 text-base leading-relaxed text-slate-700">
                          <span className="material-symbols-outlined mt-1 text-lg text-emerald-500">check_circle</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
                      <h3 className="text-2xl font-bold text-slate-900">What we're looking for</h3>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {splitContent(job.requirements, fallbackRequirements).slice(0, 4).map((item, index) => (
                          <div key={index} className="flex items-center gap-3 rounded-xl bg-white px-4 py-4 text-base text-slate-700">
                            <span className="material-symbols-outlined text-lg text-emerald-500">
                              {index % 2 === 0 ? 'code' : 'verified'}
                            </span>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                    </h2>
                    <ul className="mt-4 space-y-4">
                      {activeContent.map((item, index) => (
                        <li key={index} className="flex items-start gap-3 text-base leading-relaxed text-slate-700">
                          <span className="material-symbols-outlined mt-1 text-lg text-emerald-500">check_circle</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <span className="material-symbols-outlined text-xl">apartment</span>
                </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{job.company}</h3>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      {job.source ? String(job.source).replace(/[_-]/g, ' ') : 'Internet & Software'}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-base leading-relaxed text-slate-700">
                  {splitContent(job.description, [fallbackDescription])[0]}
                </p>

                <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-base">
                  <dt className="text-slate-500">Company size</dt>
                  <dd className="font-medium text-slate-800">{job.company_size || '500 - 1,000'}</dd>
                  <dt className="text-slate-500">Website</dt>
                  <dd className="font-medium text-emerald-600">{job.website || 'techflow.io'}</dd>
                </dl>

                <button type="button" className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                  Follow Company
                </button>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-2xl font-bold text-slate-900">Application Journey</h3>
                <ul className="mt-5 space-y-5">
                  <li className="flex items-start gap-4">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <span className="material-symbols-outlined text-base">star</span>
                    </span>
                    <div>
                      <p className="text-base font-semibold text-slate-900">Job Posted</p>
                      <p className="text-xs text-slate-500">Active · 2 days ago</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4">
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-full border ${isApplied ? 'border-emerald-500 text-emerald-500' : 'border-slate-300 text-slate-300'}`}>
                      <span className="material-symbols-outlined text-base">send</span>
                    </span>
                    <div>
                      <p className={`text-base font-semibold ${isApplied ? 'text-slate-900' : 'text-slate-400'}`}>Applied</p>
                      <p className="text-xs text-slate-500">{isApplied ? 'Application submitted' : 'Not started yet'}</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 text-slate-300">
                      <span className="material-symbols-outlined text-base">chat</span>
                    </span>
                    <div>
                      <p className="text-base font-semibold text-slate-400">Reply</p>
                      <p className="text-xs text-slate-500">Waiting for review</p>
                    </div>
                  </li>
                </ul>
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="h-[260px] bg-gradient-to-br from-slate-50 to-slate-200 p-4">
                  <div className="relative mx-auto mt-1 h-[220px] w-[90%]">
                    <div className="absolute left-1/2 top-8 h-28 w-28 -translate-x-1/2 rounded-full border-[16px] border-slate-400" />
                    <div className="absolute left-1/2 top-[102px] h-0 w-0 -translate-x-1/2 border-l-[34px] border-r-[34px] border-t-[58px] border-l-transparent border-r-transparent border-t-slate-400" />
                    <div className="absolute left-1/2 top-16 h-12 w-12 -translate-x-1/2 rounded-full bg-emerald-100">
                      <div className="m-2 h-8 w-8 rounded-full bg-emerald-500/80" />
                    </div>
                    <div className="absolute bottom-3 left-3 rounded-md bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow">
                      HQ LOCATION: NEW YORK, NY
                    </div>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1300px] items-center justify-between px-4 py-4 lg:px-6">
          <div className="flex items-center gap-2 text-xl font-bold text-slate-400">
            <span className="material-symbols-outlined text-base">work</span>
            jobnest
          </div>
          <p className="text-sm text-slate-500">© 2026 JobNest Inc. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-500">
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100">
              <span className="material-symbols-outlined text-base">alternate_email</span>
            </button>
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100">
              <span className="material-symbols-outlined text-base">public</span>
            </button>
            <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100">
              <span className="material-symbols-outlined text-base">share</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
