import type { FastifyRequest, FastifyReply } from 'fastify';
import { initSse, sendEvent, pipeSSE } from './sseHelper.js';

interface RunAgentBody {
  systemPrompt: string;
  userPrompt: string;
  tools?: Array<{ toolId: string; config?: Record<string, unknown> }>;
  model?: string;
  maxOutputTokens?: number;
  thinkingEnabled?: boolean;
  thinkingBudget?: number;
}

const VALID_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];

export async function runAgentGemini(req: FastifyRequest, reply: FastifyReply) {
  const {
    systemPrompt,
    userPrompt,
    tools = [],
    model = 'gemini-2.5-flash',
    maxOutputTokens = 32768,
    thinkingEnabled = false,
    thinkingBudget = 0,
  } = req.body as RunAgentBody;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return reply.code(500).send({ error: 'GEMINI_API_KEY is not configured' });
  }

  const selectedModel = VALID_GEMINI_MODELS.includes(model) ? model : 'gemini-2.5-flash';
  const validMaxTokens = typeof maxOutputTokens === 'number' && maxOutputTokens > 0 ? maxOutputTokens : 32768;

  initSse(reply);

  try {
    // Execute workflow tools
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

    const toolResultText = toolOutputs.length > 0
      ? '\n\nTool Results:' + toolOutputs.map((t) => `\n${t.toolId}: ${JSON.stringify(t.output)}`).join('')
      : '';

    const generationConfig: Record<string, unknown> = {
      temperature: 0.7,
      maxOutputTokens: validMaxTokens,
    };

    if (selectedModel !== 'gemini-2.5-pro') {
      generationConfig.thinkingConfig = {
        thinkingBudget: thinkingEnabled ? thinkingBudget : 0,
      };
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}${toolResultText}` }] }],
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
          generationConfig,
        }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      sendEvent(reply, { type: 'error', error: `Gemini API error ${geminiRes.status}: ${errText}` });
      reply.raw.end();
      return;
    }

    await pipeSSE(geminiRes.body!, (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        const candidate = parsed.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        const finishReason = candidate?.finishReason;
        if (text) sendEvent(reply, { type: 'delta', text });
        if (finishReason) sendEvent(reply, { type: 'done', finishReason, truncated: finishReason === 'MAX_TOKENS' });
      } catch {
        // skip malformed chunk
      }
    });
  } catch (err) {
    sendEvent(reply, { type: 'error', error: err instanceof Error ? err.message : String(err) });
  }

  reply.raw.end();
}
