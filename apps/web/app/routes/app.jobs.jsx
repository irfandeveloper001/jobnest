import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData, useSubmit } from '@remix-run/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const DEFAULT_PER_PAGE = 10;
const STATUS_OPTIONS = ['all', 'new', 'reviewed', 'applied', 'rejected'];
const SOURCE_OPTIONS = ['all', 'arbeitnow', 'remotive', 'jsearch'];

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeStatus(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return STATUS_OPTIONS.includes(normalized) ? normalized : 'all';
}

function normalizeSource(value) {
  const normalized = String(value || 'all').trim().toLowerCase();
  return SOURCE_OPTIONS.includes(normalized) ? normalized : 'all';
}

function normalizeRemote(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function normalizeWarningText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function presentWarningText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();

  if (lower.includes('quota') || lower.includes('too many requests')) {
    return 'Primary provider limit reached. Switched to backup sources.';
  }
  if (lower.includes('key invalid') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return 'Primary provider unavailable. Switched to backup sources.';
  }
  if (lower.includes('using free sources')) {
    return 'Using backup sources to keep results flowing.';
  }

  return text;
}

function normalizeCount(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function mapPublicStatus(status) {
  const value = String(status || 'new').toLowerCase();
  if (value === 'saved') return 'reviewed';
  if (value === 'ignored' || value === 'archived') return 'rejected';
  return value;
}

function normalizeJobRow(item, index) {
  const sourceValue = item?.source && typeof item.source === 'object'
    ? item.source.key || item.source.name
    : item?.source;

  return {
    id: item?.id || `job-${index}`,
    title: item?.title || 'Untitled role',
    company: item?.company || item?.company_name || 'Unknown Company',
    location: item?.location || 'Full-time • Remote',
    source: sourceValue || 'direct',
    status: mapPublicStatus(item?.status),
    posted_at: item?.posted_at || null,
  };
}

function normalizeJobsPayload(payload, page, perPage) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  const jobs = rows.map(normalizeJobRow);

  const metaPayload = payload?.meta || payload?.pagination || {};
  const currentPage = toPositiveInt(
    metaPayload.page || metaPayload.current_page || payload?.current_page || page,
    page,
  );
  const normalizedPerPage = toPositiveInt(
    metaPayload.per_page || payload?.per_page || perPage,
    perPage,
  );
  const total = toPositiveInt(metaPayload.total || payload?.total || jobs.length, jobs.length);
  const lastPage = Math.max(
    1,
    toPositiveInt(
      metaPayload.last_page || payload?.last_page || Math.ceil(total / normalizedPerPage),
      Math.ceil(total / normalizedPerPage) || 1,
    ),
  );

  return {
    jobs,
    meta: {
      page: Math.min(Math.max(1, currentPage), lastPage),
      per_page: normalizedPerPage,
      total,
      last_page: lastPage,
    },
  };
}

function buildPagination(currentPage, lastPage) {
  if (lastPage <= 5) {
    return Array.from({ length: lastPage }, (_, idx) => idx + 1);
  }

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(lastPage, start + 4);

  if (end - start < 4) {
    start = Math.max(1, end - 4);
  }

  const pages = [];
  for (let p = start; p <= end; p += 1) {
    pages.push(p);
  }

  return pages;
}

function formatSource(source) {
  if (!source) return 'Direct';
  if (String(source).toLowerCase() === 'demo') return 'JobNest';
  return String(source)
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusPill(status) {
  const value = mapPublicStatus(status);
  const map = {
    applied: {
      label: 'Applied',
      classes: 'bg-emerald-100 text-emerald-700',
    },
    reviewed: {
      label: 'Reviewed',
      classes: 'bg-amber-100 text-amber-700',
    },
    rejected: {
      label: 'Rejected',
      classes: 'bg-red-100 text-red-700',
    },
    new: {
      label: 'New',
      classes: 'bg-slate-100 text-slate-700',
    },
  };

  return map[value] || map.new;
}

function buildJobsQuery(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.source && filters.source !== 'all') params.set('source', filters.source);
  params.set('page', String(filters.page));
  params.set('per_page', String(filters.per_page));
  if (filters.new_job) params.set('new', '1');
  if (filters.notice) params.set('notice', filters.notice);
  if ((filters.notice === 'imported' || filters.notice === 'sync-empty') && filters.warning) {
    params.set('warning', filters.warning);
  }
  if (Number(filters.imported || 0) > 0) params.set('imported', String(filters.imported));
  if (Number(filters.updated || 0) > 0) params.set('updated', String(filters.updated));
  if (Number(filters.total || 0) > 0) params.set('total', String(filters.total));
  return params;
}

function buildLink(filters, patch = {}, options = {}) {
  const params = buildJobsQuery({
    ...filters,
    ...patch,
    new_job: Boolean(options.newJob),
    notice: options.notice || '',
    warning: options.warning || '',
    imported: options.imported ?? filters.imported ?? 0,
    updated: options.updated ?? filters.updated ?? 0,
    total: options.total ?? filters.total ?? 0,
  });
  return `/app/jobs?${params.toString()}`;
}

function getNoticeMessage(code) {
  const map = {
    'new-job': 'Job Assistant is open. Use filters below to find matching roles quickly.',
    'import-csv': 'CSV import is not enabled on this workspace yet.',
    imported: 'Job refresh completed successfully.',
    'status-updated': 'Job status updated.',
    archived: 'Job archived from your active list.',
    deleted: 'Job removed from your list.',
    'sync-complete': 'Sync completed and matching jobs were updated.',
    'sync-empty': 'Sync completed. No new matches were found for current filters.',
    'sync-queued': 'Background sync queued. New matching jobs will appear shortly.',
    'bulk-status': 'Select one or more rows to change status in bulk.',
    'bulk-archive': 'Select one or more rows to archive in bulk.',
    'bulk-delete': 'Select one or more rows to delete in bulk.',
    'bulk-status-updated': 'Bulk status update completed.',
    'bulk-archived': 'Selected jobs archived.',
    'bulk-deleted': 'Selected jobs removed from your list.',
  };

  return map[code] || '';
}

function extractJobIds(formData) {
  return Array.from(new Set(
    formData
      .getAll('job_ids')
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  ));
}

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const notice = (url.searchParams.get('notice') || '').trim();
  const rawWarning = (url.searchParams.get('warning') || '').trim();
  if (rawWarning && notice !== 'imported' && notice !== 'sync-empty') {
    url.searchParams.delete('warning');
    url.searchParams.delete('imported');
    url.searchParams.delete('updated');
    url.searchParams.delete('total');
    const query = url.searchParams.toString();
    throw redirect(query ? `${url.pathname}?${query}` : url.pathname);
  }

  const warning = notice === 'imported' || notice === 'sync-empty'
    ? normalizeWarningText(url.searchParams.get('warning'))
    : '';
  const filters = {
    q: (url.searchParams.get('q') || '').trim(),
    status: normalizeStatus(url.searchParams.get('status')),
    source: normalizeSource(url.searchParams.get('source')),
    page: toPositiveInt(url.searchParams.get('page'), 1),
    per_page: toPositiveInt(url.searchParams.get('per_page'), DEFAULT_PER_PAGE),
    new_job: url.searchParams.get('new') === '1',
    notice,
    warning,
    imported: notice === 'imported' ? normalizeCount(url.searchParams.get('imported')) : 0,
    updated: notice === 'imported' ? normalizeCount(url.searchParams.get('updated')) : 0,
    total: notice === 'imported' ? normalizeCount(url.searchParams.get('total')) : 0,
  };

  let jobs = [];
  let meta = {
    page: filters.page,
    per_page: filters.per_page,
    total: 0,
    last_page: 1,
  };
  let error = null;
  let profileLocationLabel = '';
  let assistantDefaults = {
    keyword: '',
    country: 'pk',
  };

  try {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.source && filters.source !== 'all') params.set('source', filters.source);
    params.set('page', String(filters.page));
    params.set('per_page', String(filters.per_page));

    const payload = await apiFetch(request, `/api/jobs?${params.toString()}`);
    const normalized = normalizeJobsPayload(payload, filters.page, filters.per_page);
    jobs = normalized.jobs;
    meta = normalized.meta;
  } catch (e) {
    error = e?.message || 'Unable to load jobs right now.';
  }

  try {
    const profilePayload = await apiFetch(request, '/api/profile');
    const profileData = profilePayload?.data || {};
    profileLocationLabel = String(profileData?.preferred_location || '').trim();
    const preferredKeywords = Array.isArray(profileData?.preferred_keywords) ? profileData.preferred_keywords : [];
    assistantDefaults = {
      keyword: String(preferredKeywords[0] || '').trim(),
      country: String(profileData?.preferred_country_iso2 || 'pk').trim().toLowerCase() || 'pk',
    };
  } catch (_error) {
    profileLocationLabel = '';
    assistantDefaults = { keyword: '', country: 'pk' };
  }

  return json({
    jobs,
    meta,
    filters,
    user: auth.user || null,
    error,
    noticeMessage: getNoticeMessage(filters.notice),
    profileLocationLabel,
    assistantDefaults,
  });
}

export async function action({ request }) {
  await requireUser(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '').trim().toLowerCase();
  const selectedJobIds = extractJobIds(formData);
  const currentFilters = {
    q: String(formData.get('q') || '').trim(),
    status: normalizeStatus(formData.get('status')),
    source: normalizeSource(formData.get('source')),
    page: toPositiveInt(formData.get('page'), 1),
    per_page: toPositiveInt(formData.get('per_page'), DEFAULT_PER_PAGE),
    new_job: String(formData.get('new') || '') === '1',
    notice: '',
    warning: '',
    imported: 0,
    updated: 0,
    total: 0,
  };

  try {
    if (intent === 'import_jobs') {
      const keyword = String(formData.get('keyword') || '').trim();
      const source = normalizeSource(formData.get('import_source'));
      const onlyNew = String(formData.get('only_new') || 'true') === 'true';
      const country = String(formData.get('country') || '').trim().toLowerCase() || 'pk';
      const remote = normalizeRemote(formData.get('remote'));

      const importPayload = {
        keyword,
        source: source === 'all' ? 'all' : source,
        only_new: onlyNew,
        country,
      };
      if (remote !== null) {
        importPayload.remote = remote;
      }

      const payload = await apiFetch(request, '/api/jobs/import', {
        method: 'POST',
        body: JSON.stringify(importPayload),
      });

      const importedCount = Number(payload?.imported || 0);
      const updatedCount = Number(payload?.updated || 0);
      const totalAffected = Number(payload?.total || importedCount + updatedCount);
      let warningText = normalizeWarningText(payload?.warning);
      if (source === 'all') {
        warningText = '';
      }
      const noticeCode = totalAffected > 0 ? 'imported' : 'sync-empty';

      return redirect(buildLink(
        {
          ...currentFilters,
          q: keyword || currentFilters.q,
          source: source === 'all' ? 'all' : source,
          status: 'all',
          page: 1,
          new_job: false,
          imported: importedCount,
          updated: updatedCount,
          total: totalAffected,
        },
        {},
        { newJob: false, notice: noticeCode, warning: warningText },
      ));
    }

    if (intent === 'update_status') {
      const jobId = String(formData.get('job_id') || '').trim();
      const status = normalizeStatus(formData.get('next_status') || formData.get('target_status'));
      if (!jobId || status === 'all') {
        return json({ error: 'Please choose a valid status.' }, { status: 400 });
      }

      await apiFetch(request, `/api/jobs/${jobId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      return redirect(buildLink(
        currentFilters,
        {},
        { newJob: currentFilters.new_job, notice: 'status-updated' },
      ));
    }

    if (intent === 'archive_job') {
      const jobId = String(formData.get('job_id') || '').trim();
      if (!jobId) {
        return json({ error: 'Please choose a valid job.' }, { status: 400 });
      }

      await apiFetch(request, `/api/jobs/${jobId}/archive`, {
        method: 'PATCH',
      });

      return redirect(buildLink(
        currentFilters,
        {},
        { newJob: currentFilters.new_job, notice: 'archived' },
      ));
    }

    if (intent === 'delete_job') {
      const jobId = String(formData.get('job_id') || '').trim();
      if (!jobId) {
        return json({ error: 'Please choose a valid job.' }, { status: 400 });
      }

      await apiFetch(request, `/api/jobs/${jobId}`, {
        method: 'DELETE',
      });

      return redirect(buildLink(
        currentFilters,
        {},
        { newJob: currentFilters.new_job, notice: 'deleted' },
      ));
    }

    if (intent === 'bulk_change_status' || intent === 'bulk_apply' || intent === 'bulk_reject') {
      const forcedStatus = intent === 'bulk_apply' ? 'applied' : (intent === 'bulk_reject' ? 'rejected' : '');
      const nextStatus = normalizeStatus(forcedStatus || formData.get('bulk_status'));
      if (!selectedJobIds.length) {
        return redirect(buildLink(
          currentFilters,
          {},
          { newJob: currentFilters.new_job, notice: 'bulk-status' },
        ));
      }
      if (nextStatus === 'all') {
        return json({ error: 'Please choose a valid bulk status.' }, { status: 400 });
      }

      for (const jobId of selectedJobIds) {
        await apiFetch(request, `/api/jobs/${jobId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        });
      }

      return redirect(buildLink(
        currentFilters,
        {},
        { newJob: currentFilters.new_job, notice: 'bulk-status-updated' },
      ));
    }

    if (intent === 'bulk_archive') {
      if (!selectedJobIds.length) {
        return redirect(buildLink(
          currentFilters,
          {},
          { newJob: currentFilters.new_job, notice: 'bulk-archive' },
        ));
      }

      for (const jobId of selectedJobIds) {
        await apiFetch(request, `/api/jobs/${jobId}/archive`, {
          method: 'PATCH',
        });
      }

      return redirect(buildLink(
        currentFilters,
        {},
        { newJob: currentFilters.new_job, notice: 'bulk-archived' },
      ));
    }

    if (intent === 'bulk_delete') {
      if (!selectedJobIds.length) {
        return redirect(buildLink(
          currentFilters,
          {},
          { newJob: currentFilters.new_job, notice: 'bulk-delete' },
        ));
      }

      for (const jobId of selectedJobIds) {
        await apiFetch(request, `/api/jobs/${jobId}`, {
          method: 'DELETE',
        });
      }

      return redirect(buildLink(
        currentFilters,
        {},
        { newJob: currentFilters.new_job, notice: 'bulk-deleted' },
      ));
    }

    if (intent === 'sync_now') {
      const payload = await apiFetch(request, '/api/jobs/sync-now', {
        method: 'POST',
      });
      const notice = payload?.queued
        ? 'sync-queued'
        : (Number(payload?.matched_jobs || 0) > 0 ? 'sync-complete' : 'sync-empty');

      return redirect(buildLink(
        {
          ...currentFilters,
          imported: Number(payload?.created || 0),
          updated: Number(payload?.updated || 0),
          total: Number(payload?.matched_jobs || 0),
        },
        {},
        { newJob: currentFilters.new_job, notice },
      ));
    }

    return redirect(buildLink(currentFilters, {}, { newJob: currentFilters.new_job }));
  } catch (error) {
    return json({ error: error?.message || 'Unable to process jobs action.' }, { status: 400 });
  }
}

export default function AppJobsRoute() {
  const { jobs, meta, filters, user, error, noticeMessage, profileLocationLabel, assistantDefaults } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const searchDebounceRef = useRef(null);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [searchQ, setSearchQ] = useState(filters.q);
  const displayName = user?.name || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  const start = meta.total > 0 ? (meta.page - 1) * meta.per_page + 1 : 0;
  const end = meta.total > 0 ? Math.min(meta.page * meta.per_page, meta.total) : 0;
  const pages = buildPagination(meta.page, meta.last_page);

  const statusCounts = jobs.reduce(
    (acc, job) => {
      const key = String(job?.status || 'new').toLowerCase();
      if (key === 'applied') acc.applied += 1;
      if (key === 'reviewed') acc.interviews += 1;
      if (key === 'offer' || key === 'offered') acc.offers += 1;
      return acc;
    },
    { applied: 0, interviews: 0, offers: 0 },
  );

  const importSummary = filters.notice === 'imported' && filters.total > 0
    ? `Imported ${filters.imported} new jobs, updated ${filters.updated}, total affected ${filters.total}.`
    : '';
  const warningMessage = presentWarningText(filters.warning);
  const availableJobIds = useMemo(() => jobs.map((job) => String(job.id)), [jobs]);
  const selectedCount = selectedJobIds.length;
  const allSelected = availableJobIds.length > 0 && selectedCount === availableJobIds.length;

  function toggleSelectAll(checked) {
    setSelectedJobIds(checked ? availableJobIds : []);
  }

  function toggleSelectOne(jobId, checked) {
    const normalized = String(jobId);
    setSelectedJobIds((prev) => {
      if (checked) {
        if (prev.includes(normalized)) return prev;
        return [...prev, normalized];
      }
      return prev.filter((id) => id !== normalized);
    });
  }

  useEffect(() => {
    setSearchQ(filters.q);
  }, [filters.q]);

  useEffect(() => () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
  }, []);

  function submitFilters(form, resetPage = true) {
    if (!form) return;
    if (resetPage) {
      const pageInput = form.querySelector('input[name="page"]');
      if (pageInput) pageInput.value = '1';
    }
    submit(form, { method: 'get', action: '/app/jobs' });
  }

  function handleSearchChange(event) {
    const { form, value } = event.currentTarget;
    setSearchQ(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      submitFilters(form, true);
    }, 350);
  }

  function handleFilterSelectChange(event) {
    submitFilters(event.currentTarget.form, true);
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
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
            <Link to="/app/jobs" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
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
            <Link to="/app/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">person</span>
              Profile
            </Link>
          </nav>

          <div className="mt-auto space-y-3">
            <Link to="/app/jobs?new=1" className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add New Job
            </Link>
            <Link to="/app/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100">
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Settings
            </Link>
          </div>
        </aside>

        <main className="flex-1 p-3 sm:p-4 lg:p-5">
          <div className="w-full min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:p-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
                <span className="material-symbols-outlined text-[16px]">work</span>
              </div>
              <div>
                <p className="text-sm font-bold leading-none">jobnest</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Jobs Workspace</p>
              </div>
            </div>
            <Link
              to={buildLink(filters, { page: 1 }, { newJob: true, notice: 'new-job' })}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-white"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              New
            </Link>
          </div>

          {noticeMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              {noticeMessage}
              {importSummary ? ` ${importSummary}` : ''}
            </div>
          ) : null}
          {warningMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              {warningMessage}
            </div>
          ) : null}

          <header className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-black leading-none tracking-tight text-slate-900">Jobs List</h1>
              <p className="mt-1 text-xs text-slate-500">Manage and track your active job applications in real-time.</p>
              <p className="mt-1 text-[11px] font-medium text-emerald-700">Showing jobs for your selected profile city by default.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Form method="post">
                <input type="hidden" name="intent" value="sync_now" />
                <input type="hidden" name="q" value={filters.q} />
                <input type="hidden" name="status" value={filters.status} />
                <input type="hidden" name="source" value={filters.source} />
                <input type="hidden" name="page" value={String(filters.page)} />
                <input type="hidden" name="per_page" value={String(filters.per_page)} />
                <input type="hidden" name="new" value={filters.new_job ? '1' : '0'} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <span className="material-symbols-outlined text-[15px]">sync</span>
                  Sync Now
                </button>
              </Form>
              <Link
                to={buildLink(filters, {}, { notice: 'import-csv' })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-[15px]">description</span>
                Import CSV
              </Link>
              <Link
                to={buildLink(filters, { page: 1 }, { newJob: true, notice: 'new-job' })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                New Job
              </Link>
            </div>
          </header>

          {filters.new_job ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">New Job Assistant</p>
                  <p className="text-xs text-slate-600">Use this quick search to pull matching jobs instantly.</p>
                </div>
                <Link
                  to={buildLink(filters, { page: 1 }, {})}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </Link>
              </div>
              <Form method="post" action="/app/jobs" className="mt-3 grid gap-2 md:grid-cols-6">
                <input
                  type="text"
                  name="keyword"
                  defaultValue={filters.q || assistantDefaults.keyword || ''}
                  placeholder="Try: Frontend, Laravel, React..."
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-emerald-500 md:col-span-2"
                />
                <select
                  name="import_source"
                  defaultValue="all"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
                >
                  <option value="all">Any source</option>
                  <option value="arbeitnow">Arbeitnow</option>
                  <option value="remotive">Remotive</option>
                  <option value="jsearch">JSearch (RapidAPI)</option>
                </select>
                <input
                  type="text"
                  name="country"
                  defaultValue={assistantDefaults.country || 'pk'}
                  maxLength={2}
                  placeholder="Country code (e.g. pk)"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-emerald-500"
                />
                <select
                  name="remote"
                  defaultValue=""
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
                >
                  <option value="">Any workplace</option>
                  <option value="true">Remote only</option>
                  <option value="false">Onsite / Hybrid</option>
                </select>
                <select
                  name="only_new"
                  defaultValue="true"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
                >
                  <option value="true">Only new jobs</option>
                  <option value="false">Include existing jobs</option>
                </select>
                <div className="flex items-center gap-2">
                  <input type="hidden" name="intent" value="import_jobs" />
                  <input type="hidden" name="q" value={filters.q} />
                  <input type="hidden" name="status" value={filters.status} />
                  <input type="hidden" name="source" value={filters.source} />
                  <input type="hidden" name="page" value="1" />
                  <input type="hidden" name="per_page" value={String(filters.per_page)} />
                  <input type="hidden" name="new" value={filters.new_job ? '1' : '0'} />
                  <button
                    type="submit"
                    className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-emerald-500 px-4 text-xs font-bold text-white hover:bg-emerald-600"
                  >
                    Find Jobs
                  </button>
                </div>
              </Form>
            </section>
          ) : null}

          <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total Active</p>
              <p className="mt-1 text-3xl font-black leading-none">{meta.total}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Applied</p>
              <p className="mt-1 text-3xl font-black leading-none text-[#16a34a]">{statusCounts.applied}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Interviews</p>
              <p className="mt-1 text-3xl font-black leading-none text-[#2563eb]">{statusCounts.interviews}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Offers</p>
              <p className="mt-1 text-3xl font-black leading-none text-[#0ea5e9]">{statusCounts.offers}</p>
            </article>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <Form method="get" action="/app/jobs" className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  name="q"
                  value={searchQ}
                  onChange={handleSearchChange}
                  placeholder="Search jobs, companies..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-500"
                />
              </div>

              <select
                name="status"
                defaultValue={filters.status}
                onChange={handleFilterSelectChange}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
              >
                <option value="all">Status: All</option>
                <option value="new">Status: New</option>
                <option value="reviewed">Status: Reviewed</option>
                <option value="applied">Status: Applied</option>
                <option value="rejected">Status: Rejected</option>
              </select>

              <select
                name="source"
                defaultValue={filters.source}
                onChange={handleFilterSelectChange}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 outline-none focus:border-emerald-500"
              >
                <option value="all">Company: All</option>
                <option value="arbeitnow">Arbeitnow</option>
                <option value="remotive">Remotive</option>
                <option value="jsearch">JSearch</option>
              </select>
              <input type="hidden" name="page" value="1" />
              <input type="hidden" name="per_page" value={String(filters.per_page)} />
            </Form>
          </section>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}
          {actionData?.error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionData.error}</div>
          ) : null}

          <Form method="post" id="jobs-bulk-form" className="hidden">
            <input type="hidden" name="q" value={filters.q} />
            <input type="hidden" name="status" value={filters.status} />
            <input type="hidden" name="source" value={filters.source} />
            <input type="hidden" name="page" value={String(filters.page)} />
            <input type="hidden" name="per_page" value={String(filters.per_page)} />
            <input type="hidden" name="new" value={filters.new_job ? '1' : '0'} />
            {selectedJobIds.map((jobId) => (
              <input key={`bulk-${jobId}`} type="hidden" name="job_ids" value={jobId} />
            ))}
          </Form>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleSelectAll(event.currentTarget.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                />
                {selectedCount} Selected
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <button
                  type="submit"
                  form="jobs-bulk-form"
                  name="intent"
                  value="bulk_apply"
                  className="inline-flex h-7 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={selectedCount === 0}
                >
                  Apply Selected
                </button>
                <button
                  type="submit"
                  form="jobs-bulk-form"
                  name="intent"
                  value="bulk_reject"
                  className="inline-flex h-7 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={selectedCount === 0}
                >
                  Reject Selected
                </button>
                <button
                  type="submit"
                  form="jobs-bulk-form"
                  name="intent"
                  value="bulk_delete"
                  className="inline-flex h-7 items-center rounded-md border border-red-200 px-2 text-[10px] font-semibold text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={selectedCount === 0}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400" />
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Job Title</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Company</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Source</th>
                    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</th>
                    <th className="w-[240px] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length ? jobs.map((job, index) => {
                    const pill = getStatusPill(job.status);
                    return (
                      <tr key={job.id || index} className="border-t border-slate-100">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedJobIds.includes(String(job.id))}
                            onChange={(event) => toggleSelectOne(job.id, event.currentTarget.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Link to={`/app/jobs/${job.id}`} className="block text-xs font-semibold text-slate-900 hover:text-emerald-700">
                            {job.title || 'Untitled role'}
                          </Link>
                          <p className="text-[10px] text-slate-500">{job.location || 'Full-time • Remote'}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-medium text-slate-700">
                          {job.company || 'Unknown Company'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {formatSource(job.source)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${pill.classes}`}>
                            {pill.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`/app/jobs/${job.id}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="View details">
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                            </Link>
                            <Form method="post" className="flex items-center gap-1">
                              <input type="hidden" name="intent" value="update_status" />
                              <input type="hidden" name="job_id" value={String(job.id)} />
                              <input type="hidden" name="q" value={filters.q} />
                              <input type="hidden" name="status" value={filters.status} />
                              <input type="hidden" name="source" value={filters.source} />
                              <input type="hidden" name="page" value={String(filters.page)} />
                              <input type="hidden" name="per_page" value={String(filters.per_page)} />
                              <input type="hidden" name="new" value={filters.new_job ? '1' : '0'} />
                              <button
                                type="submit"
                                name="next_status"
                                value="applied"
                                className="inline-flex h-7 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                aria-label="Mark applied"
                                title="Mark applied"
                              >
                                Applied
                              </button>
                              <button
                                type="submit"
                                name="next_status"
                                value="rejected"
                                className="inline-flex h-7 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                                aria-label="Mark rejected"
                                title="Mark rejected"
                              >
                                Rejected
                              </button>
                            </Form>
                            <Form method="post">
                              <input type="hidden" name="intent" value="delete_job" />
                              <input type="hidden" name="job_id" value={String(job.id)} />
                              <input type="hidden" name="q" value={filters.q} />
                              <input type="hidden" name="status" value={filters.status} />
                              <input type="hidden" name="source" value={filters.source} />
                              <input type="hidden" name="page" value={String(filters.page)} />
                              <input type="hidden" name="per_page" value={String(filters.per_page)} />
                              <input type="hidden" name="new" value={filters.new_job ? '1' : '0'} />
                              <button
                                type="submit"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-500 hover:bg-red-50"
                                aria-label="Delete job"
                                title="Delete job"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            </Form>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-12 text-center">
                        <p className="text-sm font-semibold text-slate-700">No jobs found</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {profileLocationLabel
                            ? `No matches found for ${profileLocationLabel}. Try Sync Now or broaden profile location.`
                            : 'Try changing filters, or open New Job assistant to find fresh roles.'}
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                          <Link
                            to={buildLink(filters, { page: 1 }, { newJob: true, notice: 'new-job' })}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600"
                          >
                            <span className="material-symbols-outlined text-[15px]">add</span>
                            Open New Job Assistant
                          </Link>
                          <Link
                            to="/app/dashboard"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Go to Dashboard
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5">
              <p className="text-[11px] text-slate-500">
                Showing {start}-{end} of {meta.total}
              </p>
              <div className="flex items-center gap-1">
                {meta.page > 1 ? (
                  <Link
                    to={buildLink(filters, { page: meta.page - 1 })}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                    Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-300">
                    <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                    Previous
                  </span>
                )}

                {pages.map((page) => (
                  <Link
                    key={page}
                    to={buildLink(filters, { page })}
                    className={page === meta.page
                      ? 'inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-500 px-2 text-xs font-bold text-white'
                      : 'inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100'}
                  >
                    {page}
                  </Link>
                ))}

                {meta.page < meta.last_page ? (
                  <Link
                    to={buildLink(filters, { page: meta.page + 1 })}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    Next
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-300">
                    Next
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-gradient-to-r from-[#071029] via-[#0a2539] to-[#0d3f3f] p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black leading-tight">Scale your search with AI</h2>
                <p className="mt-1 text-xs text-emerald-100">
                  Let our agent auto-fill your profile details on job sites and save hours every week.
                </p>
                <Link to="/app/settings" className="mt-3 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">
                  Try CareerAI Pro
                </Link>
              </div>
              <div className="hidden h-16 w-16 items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-400/10 lg:flex">
                <span className="material-symbols-outlined text-4xl text-emerald-500">rocket_launch</span>
              </div>
            </div>
          </section>

          <nav className="flex gap-2 overflow-x-auto pt-1 lg:hidden">
            <Link to="/app/dashboard" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Dashboard
            </Link>
            <Link to="/app/jobs" className="whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white">
              Jobs
            </Link>
            <Link to="/app/applications" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Applications
            </Link>
            <Link to="/app/inbox" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Inbox
            </Link>
            <Link to="/app/interviews" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Interviews
            </Link>
            <Link to="/app/analytics" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Analytics
            </Link>
            <Link to="/app/profile" className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
              Profile
            </Link>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                {initials}
              </div>
              <span className="max-w-[100px] truncate text-xs font-semibold">{displayName}</span>
            </div>
          </nav>
          </div>
        </main>
      </div>
    </div>
  );
}
