import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPiiGuard } from '../../lib/piiGuard.js';

export async function braveSearch(req: FastifyRequest, reply: FastifyReply) {
  const { query, numResults = 20, apiKey: userKey } = req.body as { query: string; numResults?: number; apiKey?: string };
  if (!query) return reply.code(400).send({ error: 'query is required' });

  // Pre-flight PII scan — search queries egress verbatim to Brave's servers.
  // We deliberately do NOT scan `apiKey`: it is by definition a secret, so
  // the api_key_* detectors would 100% false-positive on every call.
  const guardOk = await runPiiGuard(
    req,
    reply,
    [{ name: 'query', value: query }],
    { sse: false, route: 'POST /api/tools/brave-search' },
  );
  if (!guardOk) return;

  const apiKey = userKey ?? process.env.BRAVE_API_KEY;
  if (!apiKey) return reply.code(500).send({ error: 'Brave API key not configured' });

  const requested = Math.max(1, Math.min(200, Number(numResults) || 20));
  const numPages = Math.min(10, Math.ceil(requested / 20));
  const allResults: unknown[] = [];

  for (let offset = 0; offset < numPages; offset++) {
    const count = Math.min(20, requested - allResults.length);
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&offset=${offset}`,
        { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey } },
      );
      if (!res.ok) continue;
      const data = await res.json() as { web?: { results?: unknown[] } };
      if (data.web?.results) allResults.push(...data.web.results);
    } catch { /* skip page */ }
    if (allResults.length >= requested) break;
  }

  const results = (allResults as Array<{ title?: string; url?: string; description?: string }>).map((r) => ({
    title: r.title, url: r.url, description: r.description,
  }));

  reply.send({ results });
}

export async function googleSearch(req: FastifyRequest, reply: FastifyReply) {
  const { query, numResults = 20, apiKey: userKey, searchEngineId: userEngineId } = req.body as { query: string; numResults?: number; apiKey?: string; searchEngineId?: string };
  if (!query) return reply.code(400).send({ error: 'query is required' });

  // Pre-flight PII scan — query egresses to Google Custom Search.
  // Same rationale as braveSearch: skip `apiKey` / `searchEngineId`.
  const guardOk = await runPiiGuard(
    req,
    reply,
    [{ name: 'query', value: query }],
    { sse: false, route: 'POST /api/tools/google-search' },
  );
  if (!guardOk) return;

  const apiKey = userKey ?? process.env.GOOGLE_SEARCH_API;
  const searchEngineId = userEngineId ?? process.env.GOOGLE_SEARCH_ENGINE;
  if (!apiKey) return reply.code(500).send({ error: 'Google Search API key not configured' });
  if (!searchEngineId) return reply.code(500).send({ error: 'Google Search Engine ID not configured' });

  const requested = Math.max(1, Math.min(1000, Number(numResults) || 20));
  const numPages = Math.ceil(requested / 10);
  const allItems: unknown[] = [];

  for (let page = 0; page < numPages; page++) {
    const start = page * 10 + 1;
    const num = Math.min(10, requested - page * 10);
    try {
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&start=${start}&num=${num}`,
      );
      const data = await res.json() as { items?: unknown[]; error?: { message?: string } };
      if (!res.ok) continue;
      if (data.items) allItems.push(...data.items);
    } catch { /* skip page */ }
    if (allItems.length >= requested) break;
  }

  const results = (allItems as Array<{ title?: string; link?: string; snippet?: string }>).map((r) => ({
    title: r.title, url: r.link, description: r.snippet,
  }));

  reply.send({ results });
}
