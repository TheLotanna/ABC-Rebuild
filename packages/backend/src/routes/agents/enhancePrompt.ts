import type { FastifyRequest, FastifyReply } from 'fastify';
import { initSse, sendEvent, pipeSSE } from './sseHelper.js';

interface EnhancePromptBody {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxOutputTokens?: number;
}

export async function enhancePrompt(req: FastifyRequest, reply: FastifyReply) {
  const {
    systemPrompt,
    userPrompt,
    model = 'gemini-2.5-flash',
    maxOutputTokens = 8192,
  } = req.body as EnhancePromptBody;

  const isGemini = model.startsWith('gemini');
  const isClaude = model.startsWith('claude');
  const isGrok = model.startsWith('grok');

  initSse(reply);

  try {
    let upstream: Response;

    if (isGemini) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
      const geminiModel = model.includes('lite') ? 'gemini-2.5-flash-lite-preview-06-17'
        : model.includes('pro') ? 'gemini-2.5-pro-preview-06-05'
        : 'gemini-2.5-flash-preview-05-20';
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { maxOutputTokens, temperature: 0.7 },
          }),
        },
      );
    } else if (isClaude) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
      const claudeModel = model.includes('haiku') ? 'claude-3-5-haiku-20241022' : 'claude-sonnet-4-5-20250514';
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: maxOutputTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          stream: true,
        }),
      });
    } else if (isGrok) {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) throw new Error('XAI_API_KEY not configured');
      upstream = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.includes('code') ? 'grok-3-fast' : 'grok-3-fast',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: maxOutputTokens,
          stream: true,
        }),
      });
    } else {
      throw new Error(`Unsupported model: ${model}`);
    }

    if (!upstream.ok) {
      const errText = await upstream.text();
      sendEvent(reply, { type: 'error', error: `API error ${upstream.status}: ${errText}` });
      reply.raw.end();
      return;
    }

    await pipeSSE(upstream.body!, (jsonStr) => {
      try {
        const parsed = JSON.parse(jsonStr);
        let text = '';
        if (isGemini) {
          text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        } else if (isClaude) {
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') text = parsed.delta.text;
        } else if (isGrok) {
          text = parsed.choices?.[0]?.delta?.content ?? '';
        }
        if (text) sendEvent(reply, { type: 'delta', text });
        if (parsed.type === 'message_stop' || parsed.choices?.[0]?.finish_reason) {
          sendEvent(reply, { type: 'done' });
        }
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
