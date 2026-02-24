import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const DEFAULT_PER_PAGE = 20;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeFilter(value) {
  const filter = String(value || 'all').toLowerCase();
  if (filter === 'positive' || filter === 'negative') return filter;
  return 'all';
}

function normalizeClassification(value) {
  const key = String(value || '').toLowerCase();
  if (['positive', 'offer', 'interview', 'application', 'interested'].includes(key)) return 'positive';
  if (['negative', 'rejection', 'rejected'].includes(key)) return 'negative';
  return 'neutral';
}

function normalizeThreadsPayload(payload, page) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  const threads = rows.map((item) => {
    const classification = normalizeClassification(item.classification);
    return {
      id: item.id,
      from_name: item.from_name || item.fromName || item.from || 'Unknown Sender',
      from_email: item.from_email || item.email || 'unknown@example.com',
      subject: item.subject || '(No subject)',
      snippet: item.snippet || item.preview || item.body_preview || 'No preview available.',
      classification,
      raw_classification: item.classification || 'unknown',
      last_time_label: item.last_time_label || item.time_label || item.last_message_at || 'just now',
      to_email: item.to_email || item.recipient_email || 'you@jobnest.local',
    };
  });

  const metaPayload = payload?.meta || payload || {};
  const currentPage = toPositiveInt(
    metaPayload.page || metaPayload.current_page || page,
    page,
  );
  const perPage = toPositiveInt(
    metaPayload.per_page || payload?.per_page || DEFAULT_PER_PAGE,
    DEFAULT_PER_PAGE,
  );
  const total = toPositiveInt(metaPayload.total || payload?.total || threads.length, threads.length);
  const lastPage = Math.max(
    1,
    toPositiveInt(
      metaPayload.last_page || payload?.last_page || Math.ceil(total / perPage),
      Math.ceil(total / perPage) || 1,
    ),
  );

  return {
    threads,
    meta: {
      page: Math.min(Math.max(1, currentPage), lastPage),
      per_page: perPage,
      total,
      last_page: lastPage,
    },
  };
}

function applyThreadFilters(threads, { q, filter }) {
  const needle = String(q || '').toLowerCase().trim();

  return threads.filter((thread) => {
    if (filter !== 'all' && thread.classification !== filter) {
      return false;
    }
    if (!needle) return true;

    const haystack = [
      thread.from_name,
      thread.from_email,
      thread.subject,
      thread.snippet,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
}

function paginateList(items, page, perPage) {
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage) || 1);
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const start = (currentPage - 1) * perPage;
  const end = start + perPage;

  return {
    items: items.slice(start, end),
    meta: {
      page: currentPage,
      per_page: perPage,
      total,
      last_page: lastPage,
    },
  };
}

function normalizeConversationPayload(payload, fallbackThread) {
  if (!payload) {
    if (!fallbackThread) return null;
    return {
      thread: {
        id: fallbackThread.id,
        from_name: fallbackThread.from_name,
        from_email: fallbackThread.from_email,
        subject: fallbackThread.subject,
        to_email: fallbackThread.to_email || 'you@jobnest.local',
        last_time_label: fallbackThread.last_time_label,
        classification: fallbackThread.classification,
      },
      messages: [{
        id: `fallback-${fallbackThread.id}`,
        direction: 'in',
        body: fallbackThread.snippet || 'No message body available yet.',
        time_label: fallbackThread.last_time_label || 'just now',
      }],
      suggested_followup: fallbackThread.classification === 'negative'
        ? { text: 'Thank you for the update. I would appreciate feedback and future opportunities.' }
        : { text: 'Thanks for your message. I am available for next steps this week.' },
    };
  }

  const threadRaw = payload.thread || payload.data?.thread || fallbackThread || {};
  const messagesRaw = payload.messages || payload.data?.messages || [];
  const suggestionRaw = payload.suggested_followup || payload.data?.suggested_followup || null;

  const classification = normalizeClassification(
    threadRaw.classification || fallbackThread?.classification || 'neutral',
  );

  const messages = Array.isArray(messagesRaw)
    ? messagesRaw.map((message, index) => ({
      id: message.id || `m-${index}`,
      direction: String(message.direction || '').toLowerCase() === 'out' ? 'out' : 'in',
      body: message.body || message.message || '',
      time_label: message.time_label || message.created_at || 'just now',
    }))
    : [];

  return {
    thread: {
      id: threadRaw.id || fallbackThread?.id,
      from_name: threadRaw.from_name || threadRaw.fromName || fallbackThread?.from_name || 'Unknown Sender',
      from_email: threadRaw.from_email || fallbackThread?.from_email || 'unknown@example.com',
      subject: threadRaw.subject || fallbackThread?.subject || '(No subject)',
      to_email: threadRaw.to_email || fallbackThread?.to_email || 'you@jobnest.local',
      last_time_label: threadRaw.last_time_label || fallbackThread?.last_time_label || 'just now',
      classification,
    },
    messages: messages.length
      ? messages
      : [{
        id: 'empty',
        direction: 'in',
        body: fallbackThread?.snippet || 'No message history yet.',
        time_label: fallbackThread?.last_time_label || 'just now',
      }],
    suggested_followup: suggestionRaw
      ? { text: suggestionRaw.text || suggestionRaw.body || String(suggestionRaw) }
      : null,
  };
}

function buildInboxQuery(params, patch = {}, options = {}) {
  const next = {
    q: params.q || '',
    filter: params.filter || 'all',
    thread: params.thread || '',
    page: params.page || 1,
    label: params.label || '',
    use_draft: params.use_draft || false,
    sent: params.sent || false,
    ...patch,
  };

  const query = new URLSearchParams();
  if (next.q) query.set('q', next.q);
  if (next.filter && next.filter !== 'all') query.set('filter', next.filter);
  if (next.label) query.set('label', next.label);
  if (next.thread) query.set('thread', String(next.thread));
  if (Number(next.page) > 1) query.set('page', String(next.page));
  if (next.use_draft) query.set('use_draft', '1');
  if (next.sent) query.set('sent', '1');

  if (options.keepSent === false) {
    query.delete('sent');
  }

  return query.toString();
}

function buildInboxHref(params, patch = {}, options = {}) {
  const query = buildInboxQuery(params, patch, options);
  return `/app/inbox${query ? `?${query}` : ''}`;
}

function classificationBadge(threadClass) {
  if (threadClass === 'positive') return 'bg-emerald-100 text-emerald-700';
  if (threadClass === 'negative') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function capitalize(value) {
  const text = String(value || '');
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function loader({ request }) {
  const auth = await requireUser(request);
  const url = new URL(request.url);
  const params = {
    q: (url.searchParams.get('q') || '').trim(),
    filter: normalizeFilter(url.searchParams.get('filter')),
    thread: (url.searchParams.get('thread') || '').trim(),
    page: toPositiveInt(url.searchParams.get('page'), 1),
    label: (url.searchParams.get('label') || '').trim(),
    use_draft: url.searchParams.get('use_draft') === '1',
    sent: url.searchParams.get('sent') === '1',
  };

  let threads = [];
  let meta = {
    page: params.page,
    per_page: DEFAULT_PER_PAGE,
    total: 0,
    last_page: 1,
  };
  let conversation = null;
  let error = null;

  try {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.filter && params.filter !== 'all') search.set('filter', params.filter);
    search.set('page', String(params.page));
    const payload = await apiFetch(request, `/api/inbox/threads?${search.toString()}`);
    const normalized = normalizeThreadsPayload(payload, params.page);
    threads = normalized.threads;
    meta = normalized.meta;

    if ((params.q || params.filter !== 'all') && !threads.length) {
      const fallbackPayload = await apiFetch(request, '/api/inbox/threads?page=1&per_page=200');
      const fallback = normalizeThreadsPayload(fallbackPayload, 1);
      const filtered = applyThreadFilters(fallback.threads, params);
      const paged = paginateList(filtered, params.page, fallback.meta.per_page || DEFAULT_PER_PAGE);
      threads = paged.items;
      meta = paged.meta;
    }
  } catch (e) {
    error = e?.message || 'Unable to load inbox threads.';
  }

  const selectedThreadId = params.thread || (threads[0] ? String(threads[0].id) : null);
  const selectedThread = threads.find((item) => String(item.id) === String(selectedThreadId || '')) || null;

  if (selectedThreadId) {
    try {
      const payload = await apiFetch(request, `/api/inbox/threads/${selectedThreadId}`);
      conversation = normalizeConversationPayload(payload, selectedThread);
    } catch (e) {
      conversation = normalizeConversationPayload(null, selectedThread);
    }
  }

  const draftBody = params.use_draft && conversation?.suggested_followup?.text
    ? conversation.suggested_followup.text
    : '';

  return json({
    user: auth.user || null,
    params,
    threads,
    meta,
    selectedThreadId,
    conversation,
    draftBody,
    error,
  });
}

export async function action({ request }) {
  await requireUser(request);
  const formData = await request.formData();

  const threadId = String(formData.get('thread_id') || '').trim();
  const body = String(formData.get('body') || '').trim();

  const q = String(formData.get('q') || '').trim();
  const filter = normalizeFilter(formData.get('filter'));
  const page = toPositiveInt(formData.get('page'), 1);
  const label = String(formData.get('label') || '').trim();

  if (!threadId) {
    return json({ error: 'No thread selected.' }, { status: 400 });
  }

  if (!body) {
    return json({ error: 'Reply message is required.' }, { status: 400 });
  }

  try {
    await apiFetch(request, `/api/inbox/threads/${threadId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });

    const backParams = { q, filter, thread: threadId, page, label, sent: true };
    return redirect(buildInboxHref(backParams));
  } catch (e) {
    return json({ error: e?.message || 'Failed to send reply.' }, { status: e?.status || 400 });
  }
}

export default function AppInboxRoute() {
  const {
    user,
    params,
    threads,
    meta,
    selectedThreadId,
    conversation,
    draftBody,
    error,
  } = useLoaderData();
  const actionData = useActionData();

  const displayName = user?.name || 'User';
  const displayEmail = user?.email || 'account@jobnest.local';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  const threadStart = meta.total > 0 ? (meta.page - 1) * meta.per_page + 1 : 0;
  const threadEnd = meta.total > 0 ? Math.min(meta.page * meta.per_page, meta.total) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex w-full items-center justify-between px-3 py-3 lg:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
              <span className="material-symbols-outlined text-[18px]">mail</span>
            </div>
            <div>
              <h1 className="text-lg font-black leading-none">Inbox Monitor</h1>
              <p className="text-[11px] text-slate-500">Track recruiter responses and send follow-ups.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Form method="get" action="/app/inbox" className="hidden sm:block">
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  name="q"
                  defaultValue={params.q}
                  placeholder="Search conversations..."
                  className="h-10 w-[240px] rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                />
                {params.filter !== 'all' ? <input type="hidden" name="filter" value={params.filter} /> : null}
                {params.label ? <input type="hidden" name="label" value={params.label} /> : null}
                {selectedThreadId ? <input type="hidden" name="thread" value={selectedThreadId} /> : null}
              </div>
            </Form>

            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
              <span className="material-symbols-outlined text-[17px]">notifications</span>
            </button>
            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
              <span className="material-symbols-outlined text-[17px]">settings</span>
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-700">
                {initials}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="max-w-[120px] truncate text-xs font-semibold">{displayName}</p>
                <p className="max-w-[120px] truncate text-[10px] text-slate-500">{displayEmail}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-67px)] grid-cols-1 gap-3 p-3 lg:grid-cols-[220px_360px_1fr] lg:p-4">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="space-y-1">
            <Link
              to={buildInboxHref(params, { label: '', filter: 'all', page: 1 }, { keepSent: false })}
              className={!params.label || params.label === 'all'
                ? 'flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700'
                : 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'}
            >
              <span className="material-symbols-outlined text-[17px]">inbox</span>
              All Messages
            </Link>
            <Link
              to={buildInboxHref(params, { label: 'starred', page: 1 }, { keepSent: false })}
              className={params.label === 'starred'
                ? 'flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700'
                : 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'}
            >
              <span className="material-symbols-outlined text-[17px]">star</span>
              Starred
            </Link>
            <Link
              to={buildInboxHref(params, { label: 'sent', page: 1 }, { keepSent: false })}
              className={params.label === 'sent'
                ? 'flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700'
                : 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'}
            >
              <span className="material-symbols-outlined text-[17px]">send</span>
              Sent
            </Link>
            <Link
              to={buildInboxHref(params, { label: 'drafts', page: 1 }, { keepSent: false })}
              className={params.label === 'drafts'
                ? 'flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700'
                : 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100'}
            >
              <span className="material-symbols-outlined text-[17px]">drafts</span>
              Drafts
            </Link>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Labels</p>
            <div className="mt-2 space-y-1">
              <Link to={buildInboxHref(params, { filter: 'positive', page: 1 }, { keepSent: false })} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Positive
              </Link>
              <Link to={buildInboxHref(params, { filter: 'negative', page: 1 }, { keepSent: false })} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Negative
              </Link>
              <Link to={buildInboxHref(params, { filter: 'all', page: 1 }, { keepSent: false })} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Neutral
              </Link>
            </div>
          </div>
        </aside>

        <section className="flex min-h-[520px] flex-col rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">Conversations</h2>
              <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-1">
                <Link
                  to={buildInboxHref(params, { filter: 'all', page: 1, thread: '' }, { keepSent: false })}
                  className={params.filter === 'all'
                    ? 'rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white'
                    : 'rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100'}
                >
                  All
                </Link>
                <Link
                  to={buildInboxHref(params, { filter: 'positive', page: 1, thread: '' }, { keepSent: false })}
                  className={params.filter === 'positive'
                    ? 'rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white'
                    : 'rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100'}
                >
                  Positive
                </Link>
                <Link
                  to={buildInboxHref(params, { filter: 'negative', page: 1, thread: '' }, { keepSent: false })}
                  className={params.filter === 'negative'
                    ? 'rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white'
                    : 'rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100'}
                >
                  Negative
                </Link>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mx-3 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length ? threads.map((thread) => (
              <Link
                key={thread.id}
                to={buildInboxHref(
                  params,
                  { thread: thread.id },
                  { keepSent: false },
                )}
                className={String(thread.id) === String(selectedThreadId)
                  ? 'block border-l-4 border-emerald-500 bg-emerald-500/5 px-3 py-3'
                  : 'block border-l-4 border-transparent px-3 py-3 hover:bg-slate-50'}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{thread.from_name}</p>
                  <span className="text-[11px] text-slate-400">{thread.last_time_label}</span>
                </div>
                <p className="mt-0.5 truncate text-xs font-medium text-slate-700">{thread.subject}</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{thread.snippet}</p>
                <div className="mt-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${classificationBadge(thread.classification)}`}>
                    {capitalize(thread.classification)}
                  </span>
                </div>
              </Link>
            )) : (
              <div className="p-6 text-center">
                <p className="text-sm font-semibold text-slate-700">No conversations found</p>
                <p className="mt-1 text-xs text-slate-500">Try another filter or search term.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
            <p className="text-[11px] text-slate-500">
              Showing {threadStart}-{threadEnd} of {meta.total}
            </p>
            <div className="flex items-center gap-1">
              {meta.page > 1 ? (
                <Link to={buildInboxHref(params, { page: meta.page - 1, thread: '' }, { keepSent: false })} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                  Previous
                </Link>
              ) : (
                <span className="rounded-md px-2 py-1 text-xs font-medium text-slate-300">Previous</span>
              )}
              {meta.page < meta.last_page ? (
                <Link to={buildInboxHref(params, { page: meta.page + 1, thread: '' }, { keepSent: false })} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                  Next
                </Link>
              ) : (
                <span className="rounded-md px-2 py-1 text-xs font-medium text-slate-300">Next</span>
              )}
            </div>
          </div>
        </section>

        <section className="flex min-h-[520px] flex-col rounded-2xl border border-slate-200 bg-white">
          {conversation ? (
            <>
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{conversation.thread.from_name}</h3>
                    <p className="text-xs text-slate-500">
                      {conversation.thread.subject} · {conversation.thread.to_email}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${classificationBadge(conversation.thread.classification)}`}>
                      {capitalize(conversation.thread.classification)}
                    </span>
                    <p className="mt-1 text-[11px] text-slate-400">{conversation.thread.last_time_label}</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {conversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.direction === 'out'
                      ? 'ml-auto max-w-[86%] rounded-2xl rounded-tr-sm bg-emerald-500 px-4 py-3 text-sm text-white'
                      : 'mr-auto max-w-[86%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm text-slate-700'}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
                    <p className={message.direction === 'out' ? 'mt-2 text-[10px] text-emerald-50/90' : 'mt-2 text-[10px] text-slate-400'}>
                      {message.time_label}
                    </p>
                  </div>
                ))}
              </div>

              {conversation.suggested_followup?.text ? (
                <div className="mx-4 mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Suggested Follow-up</p>
                    <Link
                      to={buildInboxHref(
                        params,
                        { thread: conversation.thread.id, use_draft: true },
                        { keepSent: false },
                      )}
                      className="rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-600"
                    >
                      Use Draft
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{conversation.suggested_followup.text}</p>
                </div>
              ) : null}

              {params.sent ? (
                <div className="mx-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  Reply sent successfully.
                </div>
              ) : null}

              {actionData?.error ? (
                <div className="mx-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {actionData.error}
                </div>
              ) : null}

              <Form method="post" className="border-t border-slate-100 px-4 py-3">
                <input type="hidden" name="thread_id" value={String(conversation.thread.id)} />
                <input type="hidden" name="q" value={params.q} />
                <input type="hidden" name="filter" value={params.filter} />
                <input type="hidden" name="page" value={String(params.page)} />
                <input type="hidden" name="label" value={params.label} />

                <label className="sr-only" htmlFor="reply-body">Reply</label>
                <textarea
                  id="reply-body"
                  name="body"
                  defaultValue={draftBody}
                  rows={4}
                  placeholder="Write your reply..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <Link
                    to={buildInboxHref(
                      params,
                      { thread: conversation.thread.id, use_draft: false },
                      { keepSent: false },
                    )}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Discard
                  </Link>
                  <button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
                    Send Message
                  </button>
                </div>
              </Form>
            </>
          ) : (
            <div className="flex h-full min-h-[520px] items-center justify-center p-6 text-center">
              <div>
                <p className="text-sm font-semibold text-slate-700">No thread selected</p>
                <p className="mt-1 text-xs text-slate-500">Choose a conversation to view messages and reply.</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
