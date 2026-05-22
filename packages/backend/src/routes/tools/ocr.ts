import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPiiGuard } from '../../lib/piiGuard.js';

export async function ocrHandler(req: FastifyRequest, reply: FastifyReply) {
  const { imageBase64, mimeType = 'image/jpeg', imageUrl } = req.body as { imageBase64?: string; mimeType?: string; imageUrl?: string };

  const apiKey = process.env.GOOGLE_VISION_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return reply.code(500).send({ error: 'GOOGLE_VISION_API_KEY or GEMINI_API_KEY not configured' });

  // PII guard — scan `imageUrl` only. `imageBase64` is binary; running
  // regexes over base64-encoded image bytes generates constant false
  // positives (random byte runs match name_candidate / IPv4 / phone).
  const guardOk = await runPiiGuard(
    req,
    reply,
    [{ name: 'imageUrl', value: imageUrl }],
    { sse: false, route: 'POST /api/tools/ocr' },
  );
  if (!guardOk) return;

  let base64Data = imageBase64;

  if (!base64Data && imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) return reply.code(400).send({ error: `Failed to fetch image: ${res.status}` });
    base64Data = Buffer.from(await res.arrayBuffer()).toString('base64');
  }

  if (!base64Data) return reply.code(400).send({ error: 'imageBase64 or imageUrl is required' });

  try {
    // Use Gemini for OCR if GEMINI_API_KEY is available
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Extract all text from this image. Return only the extracted text, preserving formatting.' }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
        }),
      });
      if (!res.ok) throw new Error(`Gemini OCR error: ${res.status}`);
      const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return reply.send({ success: true, text, charCount: text.length });
    }

    // Fallback to Google Vision API
    const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: base64Data }, features: [{ type: 'TEXT_DETECTION' }] }] }),
    });
    if (!visionRes.ok) throw new Error(`Vision API error: ${visionRes.status}`);
    const vData = await visionRes.json() as { responses?: Array<{ fullTextAnnotation?: { text?: string } }> };
    const text = vData.responses?.[0]?.fullTextAnnotation?.text ?? '';
    reply.send({ success: true, text, charCount: text.length });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'OCR error' });
  }
}
