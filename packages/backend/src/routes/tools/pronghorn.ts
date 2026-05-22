import type { FastifyRequest, FastifyReply } from 'fastify';

interface PronghornItem {
  type: 'text' | 'image' | 'binary';
  content: string;
  title?: string;
  fileName?: string;
  contentType?: string;
}

interface PronghornBody {
  projectId: string;
  token: string;
  items: PronghornItem[];
}

interface PronghornResultEntry {
  success?: boolean;
  error?: string;
}

interface PronghornResponse {
  success?: boolean;
  error?: string;
  message?: string;
  itemsReceived?: number;
  itemsCreated?: number;
  itemsFailed?: number;
  processingTimeMs?: number;
  results?: PronghornResultEntry[];
}

export async function pronghornPost(req: FastifyRequest, reply: FastifyReply) {
  const { projectId, token, items } = req.body as PronghornBody;

  if (!projectId) return reply.code(400).send({ success: false, error: 'Project ID is required' });
  if (!token) return reply.code(400).send({ success: false, error: 'Token is required' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return reply
      .code(400)
      .send({ success: false, error: 'Items array is required and must not be empty' });
  }

  try {
    const res = await fetch('https://api.pronghorn.red/functions/v1/ingest-artifacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Id': projectId,
        'X-Share-Token': token,
      },
      body: JSON.stringify({ items }),
    });

    const responseText = await res.text();
    let data: PronghornResponse;
    try {
      data = JSON.parse(responseText) as PronghornResponse;
    } catch {
      return reply.code(502).send({
        success: false,
        error: `Pronghorn API returned invalid response: ${responseText.substring(0, 200)}`,
      });
    }

    if (!res.ok) {
      return reply.code(res.status).send({
        success: false,
        error: data.error ?? data.message ?? `Pronghorn API error: ${res.status}`,
        details: data,
      });
    }

    // HTTP 200 but the API reported per-item failures.
    if (data.success === false || (data.itemsFailed && data.itemsFailed > 0)) {
      const failedResults = (data.results ?? []).filter((r) => !r.success);
      const errorMessages = failedResults.map((r) => r.error).filter(Boolean) as string[];
      return reply.code(422).send({
        success: false,
        error:
          errorMessages.length > 0
            ? errorMessages.join('; ')
            : data.message ?? 'Pronghorn API reported failure',
        message: data.message,
        itemsReceived: data.itemsReceived,
        itemsCreated: data.itemsCreated,
        itemsFailed: data.itemsFailed,
        processingTimeMs: data.processingTimeMs,
        results: data.results,
      });
    }

    reply.send({
      success: true,
      message: data.message ?? `Sent ${items.length} items`,
      itemsReceived: data.itemsReceived,
      itemsCreated: data.itemsCreated,
      itemsFailed: data.itemsFailed,
      processingTimeMs: data.processingTimeMs,
      results: data.results,
    });
  } catch (err) {
    reply.code(500).send({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
