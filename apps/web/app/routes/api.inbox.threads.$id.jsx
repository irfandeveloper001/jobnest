import { json } from '@remix-run/node';
import { getSession, requireUser } from '../lib/session.server';

const DEFAULT_API_BASE = 'http://localhost:8000';

function buildErrorPayload(payload, fallbackMessage) {
  if (payload && typeof payload === 'object') return payload;
  if (typeof payload === 'string' && payload.trim()) return { message: payload };
  return { message: fallbackMessage };
}

async function proxyRequest(request, id, method, pathSuffix = '', body = undefined, contentType = '') {
  const apiBase = process.env.SERVICE_API_BASE_URL || DEFAULT_API_BASE;
  const session = await getSession(request);
  const token = session.get('token');
  const currentUrl = new URL(request.url);
  const targetUrl = `${apiBase}/api/inbox/threads/${id}${pathSuffix}${currentUrl.search}`;

  const headers = new Headers();
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (contentType) headers.set('Content-Type', contentType);

  const response = await fetch(targetUrl, { method, headers, body });
  const responseContentType = response.headers.get('content-type') || '';
  const payload = responseContentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (responseContentType.includes('application/json')) {
    return json(payload, { status: response.status });
  }

  return new Response(typeof payload === 'string' ? payload : '', {
    status: response.status,
    headers: {
      'Content-Type': responseContentType || 'text/plain; charset=utf-8',
    },
  });
}

export async function loader({ request, params }) {
  await requireUser(request);
  const id = params.id;

  try {
    return await proxyRequest(request, id, 'GET');
  } catch (error) {
    return json(
      buildErrorPayload(error?.payload, error?.message || 'Unable to proxy inbox request.'),
      { status: error?.status || 500 },
    );
  }
}

export async function action({ request, params }) {
  await requireUser(request);
  const id = params.id;
  const requestMethod = String(request.method || '').toUpperCase();

  try {
    if (requestMethod === 'PATCH') {
      const body = await request.text();
      const contentType = request.headers.get('Content-Type') || request.headers.get('content-type') || 'application/json';
      return await proxyRequest(request, id, 'PATCH', '', body, contentType);
    }

    const body = await request.text();
    const contentType = request.headers.get('Content-Type') || request.headers.get('content-type') || 'application/json';
    return await proxyRequest(request, id, 'POST', '/reply', body, contentType);
  } catch (error) {
    return json(
      buildErrorPayload(error?.payload, error?.message || 'Unable to proxy inbox request.'),
      { status: error?.status || 500 },
    );
  }
}
