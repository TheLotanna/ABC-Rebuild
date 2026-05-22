import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPiiGuard } from '../../lib/piiGuard.js';

const VALID_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];

export async function runNano(req: FastifyRequest, reply: FastifyReply) {
  const { prompt, model = 'gemini-3-pro-image-preview' } = req.body as { prompt?: string; model?: string };

  if (!prompt) return reply.code(400).send({ error: 'prompt is required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return reply.code(500).send({ error: 'GEMINI_API_KEY is not configured' });

  const guardOk = await runPiiGuard(
    req,
    reply,
    [{ name: 'prompt', value: prompt }],
    { sse: false, route: 'POST /api/run-nano' },
  );
  if (!guardOk) return;

  const selectedModel = VALID_IMAGE_MODELS.includes(model) ? model : 'gemini-3-pro-image-preview';

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return reply.code(500).send({ error: `Gemini Image API error: ${res.status}`, details: errText });
    }

    const data = await res.json();
    const parts: unknown[] = data.candidates?.[0]?.content?.parts ?? [];
    let imageData: string | null = null;
    let mimeType = 'image/png';

    for (const part of parts) {
      const inline = (part as Record<string, unknown>).inline_data ?? (part as Record<string, unknown>).inlineData;
      if (inline && (inline as Record<string, unknown>).data) {
        imageData = (inline as Record<string, unknown>).data as string;
        mimeType = ((inline as Record<string, unknown>).mimeType ?? (inline as Record<string, unknown>).mime_type ?? 'image/png') as string;
        break;
      }
    }

    if (!imageData) return reply.code(500).send({ error: 'No image data in response' });

    reply.send({ imageUrl: `data:${mimeType};base64,${imageData}`, mimeType, model: selectedModel });
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
