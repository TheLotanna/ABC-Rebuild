import type { FastifyRequest, FastifyReply } from 'fastify';
import JSZip from 'jszip';
import { runPiiGuard } from '../../lib/piiGuard.js';

async function getZipBuffer(url?: string, base64?: string): Promise<Buffer | null> {
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ZIP: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (base64) return Buffer.from(base64, 'base64');
  return null;
}

export async function zipHandler(req: FastifyRequest, reply: FastifyReply) {
  const { action = 'list', url, base64, filePath, filePaths } = req.body as {
    action?: 'list' | 'read' | 'extract';
    url?: string;
    base64?: string;
    filePath?: string;
    filePaths?: string[];
  };

  // PII guard — `url`, `filePath`, `filePaths` are user-controlled and can
  // carry identifying file names (e.g. "case-files/SIN-046454286.pdf").
  // `base64` is binary archive payload — skipped to avoid false positives.
  const guardOk = await runPiiGuard(
    req,
    reply,
    [
      { name: 'url', value: url },
      { name: 'filePath', value: filePath },
      { name: 'filePaths', value: filePaths?.join('\n') },
    ],
    { sse: false, route: 'POST /api/tools/zip' },
  );
  if (!guardOk) return;

  try {
    const buf = await getZipBuffer(url, base64);
    if (!buf) return reply.code(400).send({ error: 'url or base64 is required' });

    const zip = await JSZip.loadAsync(buf);

    if (action === 'list') {
      const files: Array<{ name: string; size: number; isDir: boolean }> = [];
      zip.forEach((relativePath, file) => {
        files.push({ name: relativePath, size: (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0, isDir: file.dir });
      });
      return reply.send({ success: true, fileCount: files.length, files });
    }

    if (action === 'read' && filePath) {
      const file = zip.file(filePath);
      if (!file) return reply.code(404).send({ error: `File not found in ZIP: ${filePath}` });
      const content = await file.async('string');
      return reply.send({ success: true, path: filePath, content, size: content.length });
    }

    if (action === 'extract' && filePaths?.length) {
      const extracted: Array<{ path: string; content: string }> = [];
      for (const fp of filePaths) {
        const file = zip.file(fp);
        if (file) extracted.push({ path: fp, content: await file.async('string') });
      }
      return reply.send({ success: true, files: extracted });
    }

    reply.code(400).send({ error: 'Invalid action or missing parameters' });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'ZIP processing error' });
  }
}
