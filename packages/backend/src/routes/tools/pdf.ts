import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPiiGuard } from '../../lib/piiGuard.js';

export async function pdfHandler(req: FastifyRequest, reply: FastifyReply) {
  const { action, url, base64, startPage, endPage, maxCharacters } = req.body as {
    action?: 'info' | 'extract';
    url?: string;
    base64?: string;
    startPage?: number;
    endPage?: number;
    maxCharacters?: number;
  };

  // PII guard — scan `url` only. `base64` is binary PDF and produces
  // false positives on the regex catalogue.
  const guardOk = await runPiiGuard(
    req,
    reply,
    [{ name: 'url', value: url }],
    { sse: false, route: 'POST /api/tools/pdf' },
  );
  if (!guardOk) return;

  try {
    let pdfBuffer: Buffer;

    if (url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
      pdfBuffer = Buffer.from(await res.arrayBuffer());
    } else if (base64) {
      pdfBuffer = Buffer.from(base64, 'base64');
    } else {
      return reply.code(400).send({ error: 'url or base64 is required' });
    }

    // Use pdfjs-dist via dynamic import
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    if (action === 'info' || !action) {
      reply.send({ success: true, totalPages, title: url?.split('/').pop() ?? 'document.pdf' });
      return;
    }

    // Extract text
    const start = Math.max(1, startPage ?? 1);
    const end = Math.min(totalPages, endPage ?? totalPages);
    let text = '';

    for (let pageNum = start; pageNum <= end; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: unknown) => (item as { str?: string }).str ?? '').join(' ');
      text += pageText + '\n';
    }

    if (maxCharacters && text.length > maxCharacters) text = text.slice(0, maxCharacters);

    reply.send({ success: true, text, pages: { from: start, to: end, total: totalPages }, characterCount: text.length });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'PDF processing error' });
  }
}
