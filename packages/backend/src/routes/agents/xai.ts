import type { FastifyRequest, FastifyReply } from 'fastify';
import { initSse, sendEvent, pipeSSE } from './sseHelper.js';

interface RunAgentBody {
  systemPrompt: string;
  userPrompt: string;
  tools?: Array<{ toolId: string; config?: Record<string, unknown> }>;
  model?: string;
  maxOutputTokens?: number;
}

export async function runAgentXai(req: FastifyRequest, reply: FastifyReply) {
  const {
    systemPrompt,
    userPrompt,
    tools = [],
    model = 'grok-4-fast-non-reasoning',
    maxOutputTokens = 16384,
  } = req.body as RunAgentBody;

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return reply.code(500).send({ error: 'XAI_API_KEY is not configured' });
  }

  initSse(reply);

  try {
    const toolOutputs: Array<{ toolId: string; output: unknown }> = [];
    const backendBase = `http://localhost:${process.env.PORT ?? 3000}`;

    for (const tool of tools) {
      try {
        const res = await fetch(`${backendBase}/api/tools/${tool.toolId.replace(/_/g, '-')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tool.config ?? {}),
        });
        const data = await res.json();
        toolOutputs.push({ toolId: tool.toolId, output: data });
      } catch (err) {
        toolOutputs.push({ toolId: tool.toolId, output: { error: String(err) } });
      }
    }

    if (toolOutputs.length > 0) {
      sendEvent(reply, { type: 'tools', toolOutputs });
    }

    const toolContext = toolOutputs.length > 0
      ? '\n\n=== Additional Context from Tools ===' +
        toolOutputs.map((t) => `\n\n=== ${t.toolId} Results ===\n${JSON.stringify(t.output, null, 2)}`).join('')
      : '';

    const xaiRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userPrompt}${toolContext}` },
        ],
        max_tokens: maxOutputTokens,
        stream: true,
      }),
    });

    if (!xaiRes.ok) {
      const errText = await xaiRes.text();
      sendEvent(reply, { type: 'error', error: `xAI API error ${xaiRes.status}: ${errText}` });
      reply.raw.end();
      return;
    }

    await pipeSSE(xaiRes.body!, (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) sendEvent(reply, { type: 'delta', text: content });
        const finishReason = parsed.choices?.[0]?.finish_reason;
        if (finishReason && finishReason !== null) sendEvent(reply, { type: 'done', finishReason });
      } catch {
        // skip
      }
    });

    sendEvent(reply, { type: 'done' });
  } catch (err) {
    sendEvent(reply, { type: 'error', error: err instanceof Error ? err.message : String(err) });
  }

  reply.raw.end();
}
