import type { FastifyReply } from 'fastify';

/** Write one SSE event to the raw Node.js response */
export function sendEvent(reply: FastifyReply, data: unknown) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Set SSE response headers and disable buffering */
export function initSse(reply: FastifyReply) {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders();
}

/** Read a Node.js Readable stream as text lines, calling onLine for each SSE data line */
export async function pipeSSE(
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  onLine: (jsonStr: string) => void,
) {
  const decoder = new TextDecoder();
  let buffer = '';

  const processChunk = (chunk: Uint8Array | string) => {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json && json !== '[DONE]') onLine(json);
    }
  };

  if ('getReader' in body) {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        processChunk(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    await new Promise<void>((resolve, reject) => {
      (body as NodeJS.ReadableStream)
        .on('data', processChunk)
        .on('end', resolve)
        .on('error', reject);
    });
  }
}
