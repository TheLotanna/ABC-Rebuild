import type { FastifyPluginAsync } from 'fastify';
import { runAgentGemini } from './gemini.js';
import { runAgentAnthropic } from './anthropic.js';
import { runAgentXai } from './xai.js';
import { runFreeAgent } from './freeAgent.js';
import { runNano } from './nano.js';
import { enhancePrompt } from './enhancePrompt.js';

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/run-agent', runAgentGemini);
  fastify.post('/run-agent/anthropic', runAgentAnthropic);
  fastify.post('/run-agent/xai', runAgentXai);
  fastify.post('/free-agent', runFreeAgent);
  fastify.post('/run-nano', runNano);
  fastify.post('/enhance-prompt', enhancePrompt);
};
