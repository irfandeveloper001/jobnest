import { json } from '@remix-run/node';
import { getSession, requireUser } from '../lib/session.server';

const DEFAULT_API_BASE = 'http://localhost:8000';

function buildErrorPayload(payload, fallbackMessage) {
  if (payload && typeof payload === 'object') return payload;
  if (typeof payload === 'string' && payload.trim()) return { message: payload };
  return { message: fallbackMessage };
}

export async function loader({ request }) {
  await requireUser(request);

  try {
    const apiBase = process.env.SERVICE_API_BASE_URL || DEFAULT_API_BASE;
    const session = await getSession(request);
    const token = session.get('token');
    const currentUrl = new URL(request.url);
    const targetUrl = `${apiBase}/api/jobs${currentUrl.search}`;

    const headers = new Headers();
    headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(targetUrl, { method: 'GET', headers });
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
  } catch (error) {
    return json(
      buildErrorPayload(error?.payload, error?.message || 'Unable to proxy jobs request.'),
      { status: error?.status || 500 },
    );
  }
}
