import type { FastifyRequest, FastifyReply } from 'fastify';
import * as cheerio from 'cheerio';
import mammoth from 'mammoth';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/122.0',
];

const getUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const UNSUPPORTED_EXTS = new Set(['doc', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'tar', 'gz', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'mp4', 'avi', 'mov', 'mp3', 'wav', 'exe', 'dll', 'bin']);

function getExt(url: string) {
  const path = url.split('?')[0].split('#')[0];
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

async function smartFetch(url: string, retries = 0): Promise<Response> {
  const headers: Record<string, string> = { 'User-Agent': getUA(), Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.5' };
  if (retries === 0) {
    headers['Accept-Encoding'] = 'gzip, deflate, br';
    headers['Sec-Fetch-Mode'] = 'navigate';
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    if (retries > 0) await new Promise((r) => setTimeout(r, 1500 * retries));
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok && retries < 2) return smartFetch(url, retries + 1);
    return res;
  } catch (err) {
    if (retries < 2) return smartFetch(url, retries + 1);
    throw err;
  }
}

export async function webScrape(req: FastifyRequest, reply: FastifyReply) {
  const { url, returnHtml, maxCharacters } = req.body as { url: string; returnHtml?: boolean; maxCharacters?: number };
  if (!url) return reply.code(400).send({ error: 'URL is required' });

  const accessedAt = new Date().toISOString();
  const ext = getExt(url);

  if (UNSUPPORTED_EXTS.has(ext)) {
    const filename = url.split('/').pop()?.split('?')[0] ?? url;
    return reply.send({ success: true, url, title: `Unsupported File: ${filename}`, content: `${ext.toUpperCase()} file: ${filename}\nDirect link: ${url}`, contentLength: 0, accessedAt, unsupportedFormat: true });
  }

  let res: Response;
  try {
    res = await smartFetch(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return reply.send({ success: true, url, title: `Fetch Error`, content: `Failed to fetch ${url}: ${msg}`, contentLength: 0, accessedAt, fetchError: true });
  }

  if (!res.ok) {
    const domain = new URL(url).hostname;
    return reply.send({ success: true, url, title: `HTTP ${res.status}: ${domain}`, content: `${res.status} ${res.statusText} for ${url}`, contentLength: 0, accessedAt, statusCode: res.status });
  }

  // DOCX
  if (ext === 'docx') {
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      const result = await mammoth.extractRawText({ buffer: buf });
      let content = result.value.trim();
      const orig = content.length;
      if (maxCharacters && content.length > maxCharacters) content = content.slice(0, maxCharacters);
      const filename = url.split('/').pop()?.split('?')[0] ?? 'document.docx';
      return reply.send({ success: true, url, title: filename, content, contentLength: content.length, isDocx: true, accessedAt, truncated: maxCharacters != null && orig > maxCharacters });
    } catch (err) {
      const filename = url.split('/').pop()?.split('?')[0] ?? 'document.docx';
      return reply.send({ success: true, url, title: filename, content: `DOCX extraction failed: ${err instanceof Error ? err.message : String(err)}`, contentLength: 0, isDocx: true, accessedAt, error: true });
    }
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim() || 'No title found';

  let content: string;
  let origLen: number;

  if (returnHtml) {
    origLen = html.length;
    content = maxCharacters && html.length > maxCharacters ? html.slice(0, maxCharacters) : html;
  } else {
    $('script, style, nav, footer, header, [role="navigation"]').remove();
    let text = $.text().replace(/\s+/g, ' ').trim();
    origLen = text.length;
    if (maxCharacters && text.length > maxCharacters) text = text.slice(0, maxCharacters);
    content = text;
  }

  reply.send({ success: true, url, title, content, contentLength: content.length, accessedAt, truncated: maxCharacters != null && origLen > maxCharacters, originalLength: origLen });
}
