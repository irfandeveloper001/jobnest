import { json, redirect } from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import { useRef } from 'react';
import { apiFetch } from '../lib/api.server';
import { requireUser } from '../lib/session.server';

const TOKENS = ['{{first_name}}', '{{last_name}}', '{{company_name}}', '{{job_title}}', '{{meeting_link}}'];

const DEFAULT_PREVIEW_CONTEXT = {
  first_name: 'Sarah',
  last_name: 'Jenkins',
  company_name: 'Innovate Co.',
  job_title: 'VP Product',
  meeting_link: 'https://cal.com/jobnest/15min',
  email: 's.jenkins@innovate.co',
};

function fallbackTemplate() {
  return {
    id: 'demo-template',
    name: 'Partnership Outreach',
    subject: 'Re: Exciting partnership opportunity for {{company_name}}',
    body_html:
      "<p>Hi {{first_name}},</p><p>I've been following {{company_name}} and your work as {{job_title}}.</p><p>If you are open to a short call, you can use {{meeting_link}}.</p><p>Best regards,<br/>JobNest Team</p>",
    scope: 'personal',
    status: 'draft',
    updated_at: '',
  };
}

function normalizeTemplate(item) {
  return {
    id: item?.id,
    name: item?.name || 'Untitled Template',
    subject: item?.subject || '',
    body_html: item?.body_html || '',
    scope: item?.scope || 'personal',
    status: item?.status || 'draft',
    updated_at: item?.updated_at || '',
  };
}

function normalizeTemplates(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return data.map(normalizeTemplate);
}

function normalizeScope(value) {
  const next = String(value || 'all').toLowerCase();
  return ['all', 'drafts', 'personal', 'team'].includes(next) ? next : 'all';
}

function applyScopeFilter(templates, scope) {
  if (scope === 'all') return templates;
  if (scope === 'drafts') return templates.filter((tpl) => String(tpl.status).toLowerCase() === 'draft');
  return templates.filter((tpl) => String(tpl.scope).toLowerCase() === scope);
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.template) query.set('template', String(params.template));
  if (params.scope && params.scope !== 'all') query.set('scope', params.scope);
  if (params.send_test) query.set('send_test', '1');
  if (params.saved) query.set('saved', '1');
  if (params.sent) query.set('sent', '1');
  return query.toString();
}

function buildTemplatesHref(params = {}) {
  const query = buildQuery(params);
  return `/app/emails/templates${query ? `?${query}` : ''}`;
}

function replaceTokens(input, context) {
  const safe = {
    ...DEFAULT_PREVIEW_CONTEXT,
    ...(context || {}),
  };

  return String(input || '')
    .replaceAll('{{first_name}}', safe.first_name || '')
    .replaceAll('{{last_name}}', safe.last_name || '')
    .replaceAll('{{company_name}}', safe.company_name || '')
    .replaceAll('{{job_title}}', safe.job_title || '')
    .replaceAll('{{meeting_link}}', safe.meeting_link || '');
}

function extractTemplateId(payload, fallbackId) {
  return payload?.data?.id || payload?.id || fallbackId;
}

export async function loader({ request }) {
  await requireUser(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const scope = normalizeScope(url.searchParams.get('scope'));
  const selectedId = (url.searchParams.get('template') || '').trim();
  const showSendTest = url.searchParams.get('send_test') === '1';
  const saved = url.searchParams.get('saved') === '1';
  const sent = url.searchParams.get('sent') === '1';

  let templates = [];
  let error = null;

  try {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    const payload = await apiFetch(request, `/api/email-templates${query.toString() ? `?${query.toString()}` : ''}`);
    templates = normalizeTemplates(payload);
  } catch (fetchError) {
    error = fetchError?.message || 'Unable to load templates right now.';
  }

  if (!templates.length) {
    templates = [fallbackTemplate()];
  }

  const scopedTemplates = applyScopeFilter(templates, scope);
  const availableTemplates = scopedTemplates.length ? scopedTemplates : templates;

  let selectedTemplate = availableTemplates.find((item) => String(item.id) === selectedId) || availableTemplates[0];
  let previewContext = { ...DEFAULT_PREVIEW_CONTEXT };
  let previewSubject = replaceTokens(selectedTemplate?.subject, previewContext);
  let previewBodyHtml = replaceTokens(selectedTemplate?.body_html, previewContext);

  if (selectedTemplate?.id && !String(selectedTemplate.id).startsWith('demo-')) {
    try {
      const detailPayload = await apiFetch(request, `/api/email-templates/${selectedTemplate.id}`);
      const templateData = detailPayload?.data ? normalizeTemplate(detailPayload.data) : selectedTemplate;
      const preview = detailPayload?.preview || {};

      selectedTemplate = templateData;
      previewContext = {
        ...previewContext,
        ...(preview.context || {}),
      };
      previewSubject = preview.subject || replaceTokens(templateData.subject, previewContext);
      previewBodyHtml = preview.body_html || replaceTokens(templateData.body_html, previewContext);
    } catch (detailError) {
      error = error || detailError?.message || 'Unable to load selected template details.';
    }
  }

  return json({
    templates: availableTemplates,
    selectedTemplate,
    q,
    scope,
    showSendTest,
    saved,
    sent,
    error,
    previewContext,
    previewSubject,
    previewBodyHtml,
  });
}

export async function action({ request }) {
  await requireUser(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '').trim().toLowerCase();
  const q = String(formData.get('q') || '').trim();
  const scope = normalizeScope(formData.get('scope'));

  try {
    if (intent === 'select_template') {
      const templateId = String(formData.get('template_id') || '').trim();
      return redirect(buildTemplatesHref({ q, scope, template: templateId || undefined }));
    }

    if (intent === 'save') {
      const templateId = String(formData.get('template_id') || '').trim();
      const payload = {
        name: String(formData.get('name') || '').trim() || 'Untitled Template',
        subject: String(formData.get('subject') || '').trim(),
        body_html: String(formData.get('body') || ''),
        scope: String(formData.get('template_scope') || 'personal').trim().toLowerCase(),
        status: String(formData.get('template_status') || 'draft').trim().toLowerCase(),
      };

      if (!payload.subject) {
        return json({ error: 'Subject is required.' }, { status: 400 });
      }
      if (!payload.body_html.trim()) {
        return json({ error: 'Template body cannot be empty.' }, { status: 400 });
      }
      if (!['personal', 'team'].includes(payload.scope)) {
        payload.scope = 'personal';
      }
      if (!['draft', 'active'].includes(payload.status)) {
        payload.status = 'draft';
      }

      let responsePayload;
      if (templateId && !String(templateId).startsWith('demo-')) {
        responsePayload = await apiFetch(request, `/api/email-templates/${templateId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        responsePayload = await apiFetch(request, '/api/email-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      const savedId = extractTemplateId(responsePayload, templateId);
      return redirect(buildTemplatesHref({ q, scope, template: savedId, saved: true }));
    }

    if (intent === 'send_test') {
      const templateId = String(formData.get('template_id') || '').trim();
      const testEmail = String(formData.get('test_email') || '').trim();

      if (!templateId || String(templateId).startsWith('demo-')) {
        return json({ error: 'Save this template first, then send a test email.' }, { status: 400 });
      }
      if (!testEmail) {
        return json({ error: 'Test email is required.' }, { status: 400 });
      }

      await apiFetch(request, `/api/email-templates/${templateId}/send-test`, {
        method: 'POST',
        body: JSON.stringify({ email: testEmail }),
      });

      return redirect(buildTemplatesHref({ q, scope, template: templateId, sent: true }));
    }

    return json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error) {
    return json({ error: error?.message || 'Unable to process this request.' }, { status: error?.status || 400 });
  }
}

export default function AppEmailsTemplatesRoute() {
  const data = useLoaderData();
  const actionData = useActionData();
  const editorRef = useRef(null);
  const bodyInputRef = useRef(null);
  const selectedTemplate = data.selectedTemplate || fallbackTemplate();

  const syncEditorBody = () => {
    if (editorRef.current && bodyInputRef.current) {
      bodyInputRef.current.value = editorRef.current.innerHTML;
    }
  };

  const insertVariableToken = (token) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editor.innerHTML += token;
      syncEditorBody();
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(token);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorBody();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
                <span className="material-symbols-outlined text-xl">alternate_email</span>
              </div>
              <p className="text-2xl font-black leading-none">JobNest Outreach</p>
            </div>
            <nav className="hidden items-center gap-7 text-base lg:flex">
              <Link to="/app/emails/templates" className="border-b-4 border-emerald-500 pb-1 font-semibold text-emerald-500">Templates</Link>
              <Link to="/app/emails/campaigns" className="pb-1 text-slate-500 hover:text-slate-800">Campaigns</Link>
              <Link to="/app/emails/sent" className="pb-1 text-slate-500 hover:text-slate-800">Sent</Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Form method="get" action="/app/emails/templates" className="hidden lg:block">
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-400">
                  search
                </span>
                <input
                  type="text"
                  name="q"
                  defaultValue={data.q}
                  placeholder="Search templates..."
                  className="h-10 w-[280px] rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none"
                />
                {selectedTemplate?.id ? <input type="hidden" name="template" value={selectedTemplate.id} /> : null}
                {data.scope && data.scope !== 'all' ? <input type="hidden" name="scope" value={data.scope} /> : null}
              </div>
            </Form>

            <Link
              to={buildTemplatesHref({
                q: data.q,
                scope: data.scope,
                template: selectedTemplate?.id,
                send_test: true,
              })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              <span className="material-symbols-outlined text-sm">send</span>
              Send Test
            </Link>

            <button
              type="submit"
              form="template-editor-form"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-[#0f172a] shadow-[0_10px_20px_rgba(17,212,89,0.3)] hover:bg-emerald-600"
            >
              <span className="material-symbols-outlined text-sm">save</span>
              Save Template
            </button>
          </div>
        </div>
      </header>

      {(data.error || actionData?.error || data.saved || data.sent) ? (
        <div className="border-b border-slate-200 bg-white px-4 py-2">
          {data.error ? <p className="text-xs text-red-700">{data.error}</p> : null}
          {actionData?.error ? <p className="text-xs text-red-700">{actionData.error}</p> : null}
          {data.saved ? <p className="text-xs text-emerald-700">Template saved.</p> : null}
          {data.sent ? <p className="text-xs text-emerald-700">Test email queued successfully.</p> : null}
        </div>
      ) : null}

      <main className="grid min-h-[calc(100vh-68px)] grid-cols-1 lg:grid-cols-[275px_1fr_420px]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Library</p>
            <div className="mt-3 space-y-1">
              <Link
                to={buildTemplatesHref({ q: data.q, scope: 'all' })}
                className={data.scope === 'all'
                  ? 'flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700'
                  : 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100'}
              >
                <span className="material-symbols-outlined text-sm">folder</span>
                All Templates
              </Link>
              <Link
                to={buildTemplatesHref({ q: data.q, scope: 'drafts' })}
                className={data.scope === 'drafts'
                  ? 'flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700'
                  : 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100'}
              >
                <span className="material-symbols-outlined text-sm">edit_note</span>
                Drafts
              </Link>
              <Link
                to={buildTemplatesHref({ q: data.q, scope: 'personal' })}
                className={data.scope === 'personal'
                  ? 'flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700'
                  : 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100'}
              >
                <span className="material-symbols-outlined text-sm">person</span>
                Personal
              </Link>
              <Link
                to={buildTemplatesHref({ q: data.q, scope: 'team' })}
                className={data.scope === 'team'
                  ? 'flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700'
                  : 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100'}
              >
                <span className="material-symbols-outlined text-sm">groups</span>
                Team Shared
              </Link>
            </div>
          </div>

          <div className="border-b border-slate-200 px-4 py-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Variables</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertVariableToken(token)}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">All Templates</p>
            <div className="space-y-1">
              {data.templates.map((template) => (
                <Link
                  key={template.id}
                  to={buildTemplatesHref({
                    q: data.q,
                    scope: data.scope,
                    template: template.id,
                  })}
                  className={String(template.id) === String(selectedTemplate.id)
                    ? 'block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2'
                    : 'block rounded-lg border border-transparent px-3 py-2 hover:bg-slate-100'}
                >
                  <p className="truncate text-sm font-semibold text-slate-800">{template.name}</p>
                  <p className="truncate text-xs text-slate-500">{template.subject || 'No subject yet'}</p>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col border-r border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3 text-slate-600">
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100">
                <span className="material-symbols-outlined text-base">format_bold</span>
              </button>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100">
                <span className="material-symbols-outlined text-base">format_italic</span>
              </button>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100">
                <span className="material-symbols-outlined text-base">format_underlined</span>
              </button>
              <div className="h-5 w-px bg-slate-200" />
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100">
                <span className="material-symbols-outlined text-base">format_list_bulleted</span>
              </button>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100">
                <span className="material-symbols-outlined text-base">link</span>
              </button>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100">
                <span className="material-symbols-outlined text-base">image</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => insertVariableToken('{{first_name}}')}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-emerald-500 hover:bg-emerald-50"
            >
              <span className="material-symbols-outlined text-sm">data_object</span>
              INSERT VARIABLE
            </button>
          </div>

          <Form
            id="template-editor-form"
            method="post"
            className="flex min-h-0 flex-1 flex-col bg-slate-100 p-4"
            onSubmit={syncEditorBody}
          >
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="template_id" value={selectedTemplate.id || ''} />
            <input type="hidden" name="q" value={data.q} />
            <input type="hidden" name="scope" value={data.scope} />
            <input type="hidden" name="name" value={selectedTemplate.name || 'Untitled Template'} />
            <input type="hidden" name="template_scope" value={selectedTemplate.scope || 'personal'} />
            <input type="hidden" name="template_status" value={selectedTemplate.status || 'draft'} />
            <input ref={bodyInputRef} type="hidden" name="body" defaultValue={selectedTemplate.body_html || ''} />

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center gap-4 border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-medium text-slate-400">Subject Line</p>
                <input
                  name="subject"
                  defaultValue={selectedTemplate.subject || ''}
                  className="w-full border-none bg-transparent text-3xl font-medium text-slate-900 outline-none"
                />
              </div>

              <div
                key={selectedTemplate.id || 'editor'}
                ref={editorRef}
                className="min-h-[560px] px-8 py-8 text-base leading-relaxed text-slate-800 outline-none"
                contentEditable
                suppressContentEditableWarning
                onInput={syncEditorBody}
                dangerouslySetInnerHTML={{ __html: selectedTemplate.body_html || '' }}
              />
            </div>
          </Form>
        </section>

        <aside className="flex min-h-0 flex-col bg-slate-100">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4">
            <h2 className="text-3xl font-bold text-slate-900">Live Preview</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Device:</span>
              <span className="material-symbols-outlined text-sm text-emerald-500">computer</span>
              <span className="material-symbols-outlined text-sm">smartphone</span>
            </div>
          </div>

          <div className="p-4">
            {data.showSendTest ? (
              <Form method="post" className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
                <input type="hidden" name="intent" value="send_test" />
                <input type="hidden" name="template_id" value={selectedTemplate.id || ''} />
                <input type="hidden" name="q" value={data.q} />
                <input type="hidden" name="scope" value={data.scope} />
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Send test email</span>
                  <input
                    type="email"
                    name="test_email"
                    defaultValue={data.previewContext?.email || DEFAULT_PREVIEW_CONTEXT.email}
                    required
                    className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <Link
                    to={buildTemplatesHref({
                      q: data.q,
                      scope: data.scope,
                      template: selectedTemplate.id,
                    })}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Cancel
                  </Link>
                  <button type="submit" className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-emerald-600">
                    Send
                  </button>
                </div>
              </Form>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-slate-400">
                Gmail Preview
              </div>
              <div className="px-4 py-4 text-sm">
                <p className="text-slate-400">
                  From: <span className="font-semibold text-slate-500">JobNest Team</span> &lt;no-reply@jobnest.local&gt;
                </p>
                <p className="mt-1 text-slate-400">
                  To: <span className="font-semibold text-slate-500">{data.previewContext.first_name} {data.previewContext.last_name}</span> &lt;{data.previewContext.email || DEFAULT_PREVIEW_CONTEXT.email}&gt;
                </p>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="text-2xl font-bold leading-tight text-slate-900">{data.previewSubject}</p>
                  <div
                    className="mt-4 space-y-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700"
                    dangerouslySetInnerHTML={{ __html: data.previewBodyHtml }}
                  />
                </div>
              </div>
              <div className="border-t border-slate-200 px-4 py-3 text-center">
                <button type="button" className="text-sm font-semibold text-emerald-500 hover:underline">
                  Unsubscribe from this list
                </button>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Preview as Prospect</p>
            <button type="button" className="mt-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-600">
                  {data.previewContext.first_name?.[0] || 'S'}{data.previewContext.last_name?.[0] || 'J'}
                </span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-800">{data.previewContext.first_name} {data.previewContext.last_name}</p>
                  <p className="text-xs text-slate-500">{data.previewContext.company_name} • {data.previewContext.job_title}</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-base text-slate-400">expand_more</span>
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}

