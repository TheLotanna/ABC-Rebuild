import type { FastifyRequest, FastifyReply } from 'fastify';

const BLOCKED_HEADERS = new Set(['origin', 'referer', 'host', 'cookie', 'connection', 'cache-control', 'pragma']);

function filterHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const low = k.toLowerCase();
    if (BLOCKED_HEADERS.has(low) || low.startsWith('sec-')) continue;
    out[k] = v;
  }
  return out;
}

export async function apiCall(req: FastifyRequest, reply: FastifyReply) {
  const { url, method = 'GET', headers = {}, body } = req.body as { url: string; method?: string; headers?: Record<string, string>; body?: unknown };
  if (!url) return reply.code(400).send({ error: 'URL is required' });

  const fetchOptions: RequestInit = {
    method,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Agent-Builder/1.0',
      ...filterHeaders(headers),
    },
    redirect: 'follow',
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    const res = await fetch(url, fetchOptions);
    const contentType = res.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    reply.send({ status: res.status, statusText: res.statusText, data });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
