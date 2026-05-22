import type { FastifyRequest, FastifyReply } from 'fastify';
import { initSse, sendEvent, pipeSSE } from './sseHelper.js';

interface RunAgentBody {
  systemPrompt: string;
  userPrompt: string;
  tools?: Array<{ toolId: string; config?: Record<string, unknown> }>;
  model: string;
  maxOutputTokens?: number;
}

export async function runAgentAnthropic(req: FastifyRequest, reply: FastifyReply) {
  const { systemPrompt, userPrompt, tools = [], model, maxOutputTokens = 16384 } =
    req.body as RunAgentBody;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return reply.code(500).send({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  initSse(reply);

  try {
    // Execute workflow tools (simple pass-through to internal tool routes)
    const toolOutputs: Array<{ toolId: string; output: unknown }> = [];
    const backendBase = `http://localhost:${process.env.PORT ?? 3000}`;

    for (const tool of tools) {
      try {
        const res = await fetch(`${backendBase}/api/tools/${tool.toolId.replace('_', '-')}`, {
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

    let finalPrompt = userPrompt;
    if (toolOutputs.length > 0) {
      const toolResultsText = toolOutputs
        .map((t) => `Tool: ${t.toolId}\nResult: ${JSON.stringify(t.output, null, 2)}`)
        .join('\n\n');
      finalPrompt = `${userPrompt}\n\n--- Tool Results ---\n${toolResultsText}`;
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxOutputTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: finalPrompt }],
        stream: true,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      sendEvent(reply, { type: 'error', error: `Anthropic API error ${anthropicRes.status}: ${errText}` });
      reply.raw.end();
      return;
    }

    await pipeSSE(anthropicRes.body!, (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          sendEvent(reply, { type: 'delta', text: parsed.delta.text });
        } else if (parsed.type === 'message_stop') {
          sendEvent(reply, { type: 'done', finishReason: 'STOP' });
        } else if (parsed.type === 'error') {
          sendEvent(reply, { type: 'error', error: parsed.error?.message ?? 'Unknown error' });
        }
      } catch {
        // skip malformed chunk
      }
    });
  } catch (err) {
    sendEvent(reply, { type: 'error', error: err instanceof Error ? err.message : String(err) });
  }

  reply.raw.end();
}
