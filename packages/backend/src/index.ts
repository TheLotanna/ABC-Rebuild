import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import { agentRoutes } from './routes/agents/index.js';
import { toolRoutes } from './routes/tools/index.js';

const server = Fastify({ logger: { level: 'info' } });

// Top-level `await` is fine under tsx (ESM dev mode) but the production
// `build` script targets CJS via esbuild (`--outfile=dist/index.cjs`) and
// CJS doesn't support TLA. Wrap startup in an async IIFE so both dev and
// build/start paths work.
async function start() {
  await server.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  server.register(agentRoutes, { prefix: '/api' });
  server.register(toolRoutes, { prefix: '/api/tools' });

  server.get('/health', async () => ({ status: 'ok' }));

  const port = parseInt(process.env.PORT ?? '3000');
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`Backend running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
