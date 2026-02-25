import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

function toPositiveInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '—';
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getNoticeMessage(code) {
  const map = {
    profile_saved: 'Profile saved successfully.',
    cv_uploaded: 'CV uploaded successfully and sync queued.',
    cv_deleted: 'CV removed successfully.',
    location_updated: 'Location options updated.',
  };
  return map[code] || '';
}

function buildLocationLabel(countryName, stateName, cityName) {
  return [cityName, stateName, countryName].filter(Boolean).join(', ');
}

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const notice = (url.searchParams.get('notice') || '').trim();

  let profile = {
    name: auth.user?.name || '',
    email: auth.user?.email || '',
    phone: '',
    preferred_keywords: [],
    preferred_location: '',
    preferred_country_id: null,
    preferred_state_id: null,
    preferred_city_id: null,
    preferred_country_name: '',
    preferred_state_name: '',
    preferred_city_name: '',
    preferred_job_type: 'any',
    profile_completed: false,
    profile_completed_at: null,
    cv_uploaded: false,
    cv_uploaded_at: null,
    last_sync_at: null,
  };

  let cv = null;
  let error = null;

  try {
    const payload = await apiFetch(request, '/api/profile');
    const data = payload?.data || payload || {};
    profile = {
      ...profile,
      ...data,
      preferred_keywords: Array.isArray(data?.preferred_keywords) ? data.preferred_keywords : [],
      preferred_job_type: data?.preferred_job_type || 'any',
      preferred_country_id: toPositiveInt(data?.preferred_country_id, null),
      preferred_state_id: toPositiveInt(data?.preferred_state_id, null),
      preferred_city_id: toPositiveInt(data?.preferred_city_id, null),
    };
  } catch (e) {
    error = e?.message || 'Unable to load profile.';
  }

  try {
    const cvPayload = await apiFetch(request, '/api/profile/cv');
    cv = cvPayload?.data || null;
  } catch (_e) {
    cv = null;
  }

  const hasLocationParams = ['country_id', 'state_id', 'city_id'].some((key) => url.searchParams.has(key));

  const selectedCountryId = hasLocationParams
    ? toPositiveInt(url.searchParams.get('country_id'), null)
    : toPositiveInt(profile.preferred_country_id, null);

  const selectedStateId = hasLocationParams
    ? toPositiveInt(url.searchParams.get('state_id'), null)
    : toPositiveInt(profile.preferred_state_id, null);

  const selectedCityId = hasLocationParams
    ? toPositiveInt(url.searchParams.get('city_id'), null)
    : toPositiveInt(profile.preferred_city_id, null);

  let countries = [];
  let states = [];
  let cities = [];
  let locationError = null;
  let effectiveCountryId = selectedCountryId;
  let effectiveStateId = selectedStateId;
  let effectiveCityId = selectedCityId;

  try {
    const countryPayload = await apiFetch(request, '/api/locations/countries?limit=300');
    countries = Array.isArray(countryPayload?.data) ? countryPayload.data : [];

    if (selectedCountryId) {
      const statePayload = await apiFetch(request, `/api/locations/states?country_id=${selectedCountryId}&limit=700`);
      states = Array.isArray(statePayload?.data) ? statePayload.data : [];
      if (!states.some((item) => Number(item?.id) === selectedStateId)) {
        effectiveStateId = null;
        effectiveCityId = null;
      }
    }

    if (effectiveStateId) {
      const cityPayload = await apiFetch(request, `/api/locations/cities?state_id=${effectiveStateId}&limit=1200`);
      cities = Array.isArray(cityPayload?.data) ? cityPayload.data : [];
      if (!cities.some((item) => Number(item?.id) === selectedCityId)) {
        effectiveCityId = null;
      }
    }
  } catch (e) {
    locationError = e?.message || 'Location datasets are not seeded yet.';
  }

  const selectedCountry = countries.find((item) => Number(item?.id) === effectiveCountryId) || null;
  const selectedState = states.find((item) => Number(item?.id) === effectiveStateId) || null;
  const selectedCity = cities.find((item) => Number(item?.id) === effectiveCityId) || null;

  const selectedLocationLabel = buildLocationLabel(
    selectedCountry?.name || profile?.preferred_country_name || '',
    selectedState?.name || profile?.preferred_state_name || '',
    selectedCity?.name || profile?.preferred_city_name || '',
  );

  return json({
    profile,
    cv,
    noticeMessage: getNoticeMessage(notice),
    error,
    locationError,
    locationOptions: {
      countries,
      states,
      cities,
      selectedCountryId: effectiveCountryId,
      selectedStateId: effectiveStateId,
      selectedCityId: effectiveCityId,
      selectedLocationLabel,
    },
  });
}

export async function action({ request }) {
  await requireUser(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '').trim().toLowerCase();

  const selectedCountryId = String(formData.get('preferred_country_id') || '').trim();
  const selectedStateId = String(formData.get('preferred_state_id') || '').trim();
  const selectedCityId = String(formData.get('preferred_city_id') || '').trim();

  try {
    if (intent === 'save_profile') {
      const keywordsRaw = String(formData.get('preferred_keywords') || '');
      const keywords = keywordsRaw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      await apiFetch(request, '/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          phone: String(formData.get('phone') || '').trim(),
          preferred_keywords: keywords,
          preferred_country_id: selectedCountryId ? Number(selectedCountryId) : null,
          preferred_state_id: selectedStateId ? Number(selectedStateId) : null,
          preferred_city_id: selectedCityId ? Number(selectedCityId) : null,
          preferred_job_type: String(formData.get('preferred_job_type') || 'any').trim(),
        }),
      });

      return redirect('/app/profile?notice=profile_saved');
    }

    if (intent === 'upload_cv') {
      const cvFile = formData.get('cv_file');
      if (!(cvFile && typeof cvFile === 'object' && 'size' in cvFile && cvFile.size > 0)) {
        return json({ error: 'Please select a CV file before uploading.' }, { status: 400 });
      }

      const payload = new FormData();
      payload.set('cv_file', cvFile);

      await apiFetch(request, '/api/profile/cv', {
        method: 'POST',
        body: payload,
      });

      return redirect('/app/profile?notice=cv_uploaded');
    }

    if (intent === 'delete_cv') {
      await apiFetch(request, '/api/profile/cv', {
        method: 'DELETE',
      });

      return redirect('/app/profile?notice=cv_deleted');
    }

    return redirect('/app/profile');
  } catch (error) {
    return json({ error: error?.message || 'Unable to update profile right now.' }, { status: error?.status || 400 });
  }
}

export default function AppProfileRoute() {
  const { profile, cv, noticeMessage, error, locationError, locationOptions } = useLoaderData();
  const actionData = useActionData();

  const displayName = profile?.name || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  const keywordsText = Array.isArray(profile?.preferred_keywords)
    ? profile.preferred_keywords.join(', ')
    : '';

  const { countries, states, cities, selectedCountryId, selectedStateId, selectedCityId, selectedLocationLabel } = locationOptions;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-4 lg:flex">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-white">
              <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
            </div>
            <div>
              <p className="text-sm font-bold leading-none">jobnest</p>
              <p className="text-[11px] text-slate-500">application tracker</p>
            </div>
          </div>

          <nav className="mt-5 space-y-1">
            <Link to="/app/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">dashboard</span>
              Dashboard
            </Link>
            <Link to="/app/jobs" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">work</span>
              Jobs
            </Link>
            <Link to="/app/applications" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">send</span>
              Applications
            </Link>
            <Link to="/app/inbox" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">mail</span>
              Inbox
            </Link>
            <Link to="/app/interviews" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">event</span>
              Interviews
            </Link>
            <Link to="/app/analytics" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">bar_chart</span>
              Analytics
            </Link>
            <Link to="/app/profile" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <span className="material-symbols-outlined text-[16px]">person</span>
              Profile
            </Link>
          </nav>

          <div className="mt-auto space-y-3">
            <Link to="/app/jobs" className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
              <span className="material-symbols-outlined text-[16px]">work</span>
              Browse Jobs
            </Link>
          </div>
        </aside>

        <main className="flex-1 p-3 sm:p-4 lg:p-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Profile</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Manage your information and CV for automatic job matching.</p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                  {initials}
                </div>
                <div className="leading-tight">
                  <p className="max-w-[120px] truncate text-[11px] font-semibold">{displayName}</p>
                  <p className="max-w-[120px] truncate text-[10px] text-slate-500">{profile?.email || ''}</p>
                </div>
              </div>
            </header>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <section className="rounded-xl border border-slate-200 p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold">Profile Details</h2>
                  {profile?.profile_completed ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Profile Completed</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Profile Incomplete</span>
                  )}
                </div>

                <Form method="get" className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">Preferred Location (Country, State, City)</p>
                  <p className="mt-1 text-[11px] text-slate-500">Select a location to improve job matching accuracy.</p>

                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Country
                      <select
                        name="country_id"
                        defaultValue={selectedCountryId || ''}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-emerald-500"
                      >
                        <option value="">Select country</option>
                        {countries.map((country) => (
                          <option key={country.id} value={country.id}>
                            {country.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[11px] font-medium text-slate-700">
                      State
                      <select
                        name="state_id"
                        defaultValue={selectedStateId || ''}
                        disabled={!selectedCountryId}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-100"
                      >
                        <option value="">Select state</option>
                        {states.map((state) => (
                          <option key={state.id} value={state.id}>
                            {state.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[11px] font-medium text-slate-700">
                      City
                      <select
                        name="city_id"
                        defaultValue={selectedCityId || ''}
                        disabled={!selectedStateId}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-emerald-500 disabled:bg-slate-100"
                      >
                        <option value="">Select city</option>
                        {cities.map((city) => (
                          <option key={city.id} value={city.id}>
                            {city.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500">
                      {selectedLocationLabel ? `Selected: ${selectedLocationLabel}` : 'No location selected yet.'}
                    </p>
                    <button type="submit" className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                      Update Options
                    </button>
                  </div>
                </Form>

                <Form method="post" className="space-y-3">
                  <input type="hidden" name="intent" value="save_profile" />
                  <input type="hidden" name="preferred_country_id" value={selectedCountryId || ''} />
                  <input type="hidden" name="preferred_state_id" value={selectedStateId || ''} />
                  <input type="hidden" name="preferred_city_id" value={selectedCityId || ''} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Name
                      <input type="text" value={profile?.name || ''} readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" />
                    </label>
                    <label className="block text-xs font-medium text-slate-700">
                      Email
                      <input type="text" value={profile?.email || ''} readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" />
                    </label>
                  </div>

                  <label className="block text-xs font-medium text-slate-700">
                    Phone
                    <input
                      type="text"
                      name="phone"
                      defaultValue={profile?.phone || ''}
                      placeholder="+92..."
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>

                  <label className="block text-xs font-medium text-slate-700">
                    Preferred Keywords
                    <input
                      type="text"
                      name="preferred_keywords"
                      defaultValue={keywordsText}
                      placeholder="frontend, react, laravel"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Preferred Job Type
                      <select
                        name="preferred_job_type"
                        defaultValue={profile?.preferred_job_type || 'any'}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      >
                        <option value="any">Any</option>
                        <option value="full-time">Full-time</option>
                        <option value="contract">Contract</option>
                        <option value="part-time">Part-time</option>
                        <option value="internship">Internship</option>
                      </select>
                    </label>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">Preferred Location</p>
                      <p className="mt-1">{selectedLocationLabel || 'Select country, state, and city above.'}</p>
                    </div>
                  </div>

                  <button type="submit" className="inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                    Save Profile
                  </button>
                </Form>
              </section>

              <section className="space-y-3">
                <article className="rounded-xl border border-slate-200 p-4">
                  <h2 className="text-sm font-bold">CV Upload</h2>
                  <p className="mt-1 text-xs text-slate-500">PDF, DOC, DOCX up to 5MB.</p>

                  <Form method="post" encType="multipart/form-data" className="mt-3 space-y-2">
                    <input type="hidden" name="intent" value="upload_cv" />
                    <input type="file" name="cv_file" accept=".pdf,.doc,.docx" className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs" />
                    <button type="submit" className="inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                      Upload CV
                    </button>
                  </Form>

                  {cv ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      <p><span className="font-semibold">File:</span> {cv.filename}</p>
                      <p><span className="font-semibold">Size:</span> {formatBytes(cv.size_bytes)}</p>
                      <p><span className="font-semibold">Uploaded:</span> {formatDate(cv.uploaded_at)}</p>

                      <Form method="post" className="mt-2">
                        <input type="hidden" name="intent" value="delete_cv" />
                        <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100">
                          Delete CV
                        </button>
                      </Form>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">No CV uploaded yet.</p>
                  )}
                </article>

                <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                  <p><span className="font-semibold">Last sync:</span> {formatDate(profile?.last_sync_at)}</p>
                  <p className="mt-1"><span className="font-semibold">Profile completed at:</span> {formatDate(profile?.profile_completed_at)}</p>
                  <Link to="/app/jobs" className="mt-3 inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                    Go to Jobs
                  </Link>
                </article>
              </section>
            </div>

            {locationError ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {locationError} Run: <code className="font-mono">php artisan db:seed --class=LocationsSeeder</code>
              </div>
            ) : null}

            {noticeMessage ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {noticeMessage}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}

            {actionData?.error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {actionData.error}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
