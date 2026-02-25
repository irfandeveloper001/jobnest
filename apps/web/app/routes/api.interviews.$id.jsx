import { json } from '@remix-run/node';
import { getSession, requireUser } from '../lib/session.server';

const DEFAULT_API_BASE = 'http://localhost:8000';
const ALLOWED_METHODS = ['GET', 'PATCH', 'DELETE'];

function buildErrorPayload(payload, fallbackMessage) {
  if (payload && typeof payload === 'object') return payload;
  if (typeof payload === 'string' && payload.trim()) return { message: payload };
  return { message: fallbackMessage };
}

async function proxyInterviewByIdRequest(request, id, method, options = {}) {
  const apiBase = process.env.SERVICE_API_BASE_URL || DEFAULT_API_BASE;
  const session = await getSession(request);
  const token = session.get('token');
  const currentUrl = new URL(request.url);
  const targetUrl = `${apiBase}/api/interviews/${id}${currentUrl.search}`;

  const headers = new Headers();
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const body = options.body;
  if (options.contentType) headers.set('Content-Type', options.contentType);

  const response = await fetch(targetUrl, { method, headers, body });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (contentType.includes('application/json')) {
    return json(payload, { status: response.status });
  }

  return new Response(typeof payload === 'string' ? payload : '', {
    status: response.status,
    headers: {
      'Content-Type': contentType || 'text/plain; charset=utf-8',
    },
  });
}

function resolveMethod(request, formData) {
  const requestMethod = String(request.method || '').toUpperCase();
  if (ALLOWED_METHODS.includes(requestMethod)) return requestMethod;

  const override = String(formData?.get('_method') || '').toUpperCase();
  if (ALLOWED_METHODS.includes(override)) return override;
  return 'PATCH';
}

export async function loader({ request, params }) {
  await requireUser(request);
  const id = params.id;

  try {
    return await proxyInterviewByIdRequest(request, id, 'GET');
  } catch (error) {
    return json(
      buildErrorPayload(error?.payload, error?.message || 'Unable to proxy interview request.'),
      { status: error?.status || 500 },
    );
  }
}

export async function action({ request, params }) {
  await requireUser(request);
  const id = params.id;

  try {
    const requestMethod = String(request.method || '').toUpperCase();
    if (requestMethod === 'DELETE') {
      return await proxyInterviewByIdRequest(request, id, 'DELETE');
    }

    if (requestMethod === 'PATCH') {
      const body = await request.text();
      const contentType = request.headers.get('Content-Type') || request.headers.get('content-type') || 'application/json';
      return await proxyInterviewByIdRequest(request, id, 'PATCH', { body, contentType });
    }

    const formData = await request.formData();
    const method = resolveMethod(request, formData);
    let body;
    let contentType;
    if (method === 'PATCH') {
      const payload = Object.fromEntries(formData.entries());
      body = JSON.stringify(payload);
      contentType = 'application/json';
    }

    return await proxyInterviewByIdRequest(request, id, method, { body, contentType });
  } catch (error) {
    return json(
      buildErrorPayload(error?.payload, error?.message || 'Unable to proxy interview request.'),
      { status: error?.status || 500 },
    );
  }
}
