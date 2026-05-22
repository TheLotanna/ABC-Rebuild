import type { FastifyRequest, FastifyReply } from 'fastify';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FreeAgentRequest {
  prompt?: string;
  model?: string;
  blackboard?: Array<{ category: string; content: string; data?: unknown; tools?: string[] }>;
  sessionFiles?: Array<{ id: string; filename: string; mimeType: string; size: number; content?: string }>;
  previousToolResults?: Array<{ tool: string; success: boolean; result?: unknown; error?: string }>;
  iteration?: number;
  scratchpad?: string;
  assistanceResponse?: { response?: string; fileId?: string; selectedChoice?: string };
  secretOverrides?: Record<string, { params?: Record<string, unknown>; headers?: Record<string, string> }>;
  configuredParams?: Array<{ tool: string; param: string }>;
  toolResultAttributes?: Record<string, { result: unknown; size: number; tool?: string; iteration?: number; createdAt?: string }>;
  artifacts?: Array<{ id: string; type: string; title: string; content: string; description?: string }>;
  promptData?: {
    sections: Array<{ id: string; type: string; title: string; content: string; order: number; editable: string; variables?: string[] }>;
    toolOverrides?: Record<string, { description?: string; disabled?: boolean }>;
    disabledTools?: string[];
    toolDefinitions?: Array<{ id: string; name: string; description: string; category: string; parameters: Record<string, { type: string; required?: boolean; description?: string }> }>;
  };
  advancedFeatures?: { selfAuthorEnabled?: boolean; spawnEnabled?: boolean; maxChildren?: number; childMaxIterations?: number };
  toolInstances?: Array<{ id: string; baseToolId: string; instanceName: string; fullToolId: string; label: string; description: string }>;
}

interface ResolverContext {
  scratchpad: string;
  blackboard: Array<{ category: string; content: string }>;
  toolResultAttributes: Record<string, { result: unknown; size: number }>;
  artifacts: Array<{ id: string; type: string; title: string; content: string; description?: string }>;
}

// ─── Reference Resolution ─────────────────────────────────────────────────────

function resolveReferences(value: unknown, ctx: ResolverContext): unknown {
  if (typeof value === 'string') return resolveString(value, ctx);
  if (Array.isArray(value)) return value.map((v) => resolveReferences(v, ctx));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveReferences(v, ctx);
    return out;
  }
  return value;
}

function resolveString(str: string, ctx: ResolverContext): string {
  return str
    .replace(/\{\{scratchpad\}\}/gi, () => ctx.scratchpad || '')
    .replace(/\{\{blackboard\}\}/gi, () =>
      ctx.blackboard.length === 0
        ? '[No blackboard entries]'
        : ctx.blackboard.map((e) => `[${e.category.toUpperCase()}]: ${e.content}`).join('\n\n'),
    )
    .replace(/\{\{attributes\}\}/gi, () => {
      const attrs = ctx.toolResultAttributes;
      if (!attrs || Object.keys(attrs).length === 0) return '{}';
      const fmt: Record<string, unknown> = {};
      for (const [n, a] of Object.entries(attrs)) fmt[n] = a.result;
      return JSON.stringify(fmt, null, 2);
    })
    .replace(/\{\{attribute:([^}]+)\}\}/gi, (_, name) => {
      const attr = ctx.toolResultAttributes?.[name.trim()];
      if (!attr) return `[Attribute '${name.trim()}' not found]`;
      return typeof attr.result === 'string' ? attr.result : JSON.stringify(attr.result, null, 2);
    })
    .replace(/\{\{artifacts\}\}/gi, () =>
      ctx.artifacts.length === 0
        ? '[]'
        : JSON.stringify(ctx.artifacts.map((a) => ({ id: a.id, type: a.type, title: a.title, content: a.content, description: a.description })), null, 2),
    )
    .replace(/\{\{artifact:([^}]+)\}\}/gi, (_, id) => {
      const a = ctx.artifacts.find((x) => x.id === id.trim() || x.title === id.trim());
      return a ? a.content : `[Artifact '${id.trim()}' not found]`;
    });
}

// ─── Prompt Building ──────────────────────────────────────────────────────────

function buildSystemPrompt(req: FreeAgentRequest): string {
  const { promptData, blackboard = [], sessionFiles = [], previousToolResults = [], iteration = 1, scratchpad = '', artifacts = [], assistanceResponse, configuredParams, advancedFeatures, toolInstances, toolResultAttributes = {} } = req;

  if (!promptData?.sections?.length) throw new Error('promptData is required');

  const runtimeVars: Record<string, string> = {
    '{{TOOLS_LIST}}': buildToolsList(promptData, advancedFeatures, toolInstances),
    '{{SESSION_FILES}}': formatSessionFiles(sessionFiles),
    '{{CONFIGURED_PARAMS}}': formatConfiguredParams(configuredParams),
    '{{BLACKBOARD_CONTENT}}': formatBlackboard(blackboard),
    '{{SCRATCHPAD_CONTENT}}': formatScratchpad(scratchpad),
    '{{PREVIOUS_RESULTS}}': formatPreviousResults(previousToolResults),
    '{{CURRENT_ITERATION}}': String(iteration),
    '{{ARTIFACTS_LIST}}': formatArtifactsList(artifacts),
    '{{ATTRIBUTES_SUMMARY}}': formatAttributesSummary(toolResultAttributes),
    '{{ASSISTANCE_RESPONSE}}': formatAssistanceResponse(assistanceResponse),
    '{{USER_TASK}}': '',
    '{{SELF_AUTHOR}}': advancedFeatures?.selfAuthorEnabled ? '## Self-Author Capabilities\nYou have access to read_self and write_self tools.\n' : '',
    '{{SPAWN}}': advancedFeatures?.spawnEnabled ? `## Spawn Capabilities\nYou can create up to ${advancedFeatures.maxChildren ?? 5} child agents.\n` : '',
  };

  const sorted = [...promptData.sections].sort((a, b) => a.order - b.order);
  let prompt = '';
  for (const section of sorted) {
    let content = section.content;
    for (const [k, v] of Object.entries(runtimeVars)) content = content.split(k).join(v);
    if ((section.type === 'dynamic' || section.type === 'advanced') && !content.trim()) continue;
    prompt += `<prompt-section id="${section.id}" editable="${section.editable}" type="${section.type}">\n${content}\n</prompt-section>\n\n`;
  }
  return prompt.trim();
}

function buildToolsList(promptData: FreeAgentRequest['promptData'], advancedFeatures?: FreeAgentRequest['advancedFeatures'], toolInstances?: FreeAgentRequest['toolInstances']): string {
  if (!promptData?.toolDefinitions?.length) return '\n## Available Tools\nNo tool definitions provided.\n';
  const disabled = new Set<string>([...(promptData.disabledTools ?? [])]);
  if (promptData.toolOverrides) for (const [id, o] of Object.entries(promptData.toolOverrides)) if (o.disabled) disabled.add(id);

  const instanceMap: Record<string, typeof toolInstances> = {};
  for (const inst of toolInstances ?? []) {
    if (!instanceMap[inst.baseToolId]) instanceMap[inst.baseToolId] = [];
    instanceMap[inst.baseToolId]!.push(inst);
  }

  const lines: string[] = [`\n## Available Tools`];
  for (const tool of promptData.toolDefinitions) {
    if (tool.category === 'advanced_self_author' && !advancedFeatures?.selfAuthorEnabled) continue;
    if (tool.category === 'advanced_spawn' && !advancedFeatures?.spawnEnabled) continue;
    if (disabled.has(tool.id)) continue;
    const desc = promptData.toolOverrides?.[tool.id]?.description ?? tool.description;
    const params = Object.entries(tool.parameters ?? {}).map(([n, p]) => `${n}${p.required ? '' : '?'}`).join(', ');
    const instances = instanceMap[tool.id];
    if (instances?.length) {
      for (const inst of instances) {
        if (!disabled.has(inst.fullToolId)) lines.push(`- **${inst.fullToolId}**: ${inst.description} (params: ${params})`);
      }
    } else {
      lines.push(`- **${tool.id}**: ${desc} (params: ${params})`);
    }
  }
  return lines.join('\n') + '\n';
}

function formatSessionFiles(files: FreeAgentRequest['sessionFiles'] = []): string {
  if (!files.length) return '\n## Session Files: None provided.';
  return '\n## Session Files Available:\n' + files.map((f) => `- ${f.filename} (fileId: "${f.id}", type: ${f.mimeType})`).join('\n');
}

function formatConfiguredParams(params?: FreeAgentRequest['configuredParams']): string {
  if (!params?.length) return '';
  const byTool: Record<string, string[]> = {};
  for (const cp of params) { if (!byTool[cp.tool]) byTool[cp.tool] = []; byTool[cp.tool].push(cp.param); }
  return '\n## Pre-Configured Tool Parameters\n' + Object.entries(byTool).map(([t, ps]) => `- ${t}: ${ps.join(', ')}`).join('\n') + '\n';
}

function formatBlackboard(bb: FreeAgentRequest['blackboard'] = []): string {
  if (!bb.length) return '\n## BLACKBOARD: Empty.';
  const fmt = (e: { category: string; content: string; tools?: string[] }, i: number) =>
    `[#${i} ${e.category}]${e.tools?.length ? ` | Tools: [${e.tools.join(', ')}]` : ''} ${e.content}`;
  if (bb.length <= 4) return '\n## YOUR BLACKBOARD:\n' + bb.map((e, i) => fmt(e, i + 1)).join('\n\n');
  const older = bb.slice(0, -4); const recent = bb.slice(-4, -1); const last = bb[bb.length - 1];
  let s = '\n## YOUR BLACKBOARD:\n';
  if (older.length) s += `\n### Older (${older.length}):\n` + older.map((e, i) => `[#${i + 1} ${e.category}] ${e.content.slice(0, 150)}...`).join('\n\n') + '\n';
  s += '\n### Recent:\n' + recent.map((e, i) => fmt(e, older.length + i + 1)).join('\n\n');
  s += '\n### Last:\n' + fmt(last, bb.length);
  return s;
}

function formatScratchpad(sp: string): string {
  if (!sp?.trim()) return '\n## YOUR SCRATCHPAD: Empty.';
  const t = sp.length > 10000 ? sp.slice(0, 10000) + `\n...[Truncated - ${sp.length} total chars]` : sp;
  return `\n## YOUR SCRATCHPAD (${sp.length} chars):\n${t}`;
}

function formatArtifactsList(artifacts: FreeAgentRequest['artifacts'] = []): string {
  if (!artifacts.length) return '\n## YOUR ARTIFACTS: None created yet.';
  return '\n## YOUR CREATED ARTIFACTS:\n' + artifacts.map((a, i) => `${i + 1}. **${a.title}** (${a.type}, ${a.content.length} chars)\n   ID: ${a.id}`).join('\n\n');
}

function formatAttributesSummary(attrs: Record<string, { result: unknown; size: number; tool?: string; iteration?: number }> = {}): string {
  const entries = Object.entries(attrs);
  if (!entries.length) return '\n## AVAILABLE ATTRIBUTES: None saved yet.';
  return '\n## AVAILABLE ATTRIBUTES:\n' + entries.map(([n, a], i) => `${i + 1}. **${n}** (from ${a.tool ?? 'unknown'}, iteration ${a.iteration ?? '?'}, ${(a.size / 1024).toFixed(1)} KB)`).join('\n');
}

function formatPreviousResults(results: FreeAgentRequest['previousToolResults'] = []): string {
  if (!results.length) return '';
  const fmted = results.map((r) => {
    const rs = r.result === undefined ? (r.error ? `Error: ${r.error}` : 'No result') : JSON.stringify(r.result, null, 2);
    const disp = rs.length > 250000 ? rs.slice(0, 250000) + '\n...[truncated]' : rs;
    return `### Tool: ${r.tool}\n\`\`\`json\n${disp}\n\`\`\``;
  }).join('\n\n');
  return `\n\n## PREVIOUS ITERATION TOOL RESULTS\n${fmted}\n`;
}

function formatAssistanceResponse(ar?: FreeAgentRequest['assistanceResponse']): string {
  if (!ar?.response && !ar?.selectedChoice) return '';
  return `\n\n## User Response\nThe user answered: "${ar.response ?? ar.selectedChoice}"\n`;
}

// ─── LLM Calling ─────────────────────────────────────────────────────────────

function getProvider(model: string): 'gemini' | 'claude' | 'grok' {
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('grok')) return 'grok';
  return 'gemini';
}

function getClaudeResponseTool() {
  return {
    name: 'respond_with_actions',
    description: 'Return your reasoning, tool calls, blackboard entry, and status.',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        tool_calls: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string' }, params: { type: 'object' } }, required: ['tool', 'params'] } },
        blackboard_entry: { type: 'object', properties: { category: { type: 'string' }, content: { type: 'string' } }, required: ['category', 'content'] },
        status: { type: 'string', enum: ['in_progress', 'completed', 'needs_assistance', 'error'] },
        message_to_user: { type: 'string' },
        artifacts: { type: 'array', items: { type: 'object' } },
        final_report: { type: 'object' },
      },
      required: ['reasoning', 'tool_calls', 'blackboard_entry', 'status'],
    },
  };
}

async function callLLM(systemPrompt: string, userPrompt: string, model: string): Promise<{ success: boolean; response?: string; error?: string }> {
  const provider = getProvider(model);
  try {
    let res: Response;
    if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return { success: false, error: 'GEMINI_API_KEY not configured' };
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Task: ${userPrompt}` }] }],
          generationConfig: { maxOutputTokens: 16384, temperature: 0.7, responseMimeType: 'application/json' },
        }),
      });
    } else if (provider === 'claude') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return { success: false, error: 'ANTHROPIC_API_KEY not configured' };
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          system: systemPrompt,
          messages: [{ role: 'user', content: `User Task: ${userPrompt}` }],
          tools: [getClaudeResponseTool()],
          tool_choice: { type: 'tool', name: 'respond_with_actions' },
        }),
      });
    } else {
      const key = process.env.XAI_API_KEY;
      if (!key) return { success: false, error: 'XAI_API_KEY not configured' };
      res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `User Task: ${userPrompt}` }],
          max_tokens: 16384,
          temperature: 0.7,
          response_format: { type: 'json_schema', json_schema: { name: 'free_agent_response', strict: false } },
        }),
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `LLM API error: ${res.status} ${errText.slice(0, 300)}` };
    }
    const data = await res.json();
    let text = '';
    if (provider === 'gemini') text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    else if (provider === 'claude') {
      const toolBlock = data.content?.find((b: { type: string }) => b.type === 'tool_use');
      text = toolBlock?.input ? JSON.stringify(toolBlock.input) : (data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '');
    } else text = data.choices?.[0]?.message?.content ?? '';
    return { success: true, response: text };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

function parseAgentResponse(text: string): unknown {
  if (!text) return null;
  const clean = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  for (const attempt of [text.trim(), clean(text.trim())]) {
    try { return fixParsed(JSON.parse(attempt)); } catch { /* continue */ }
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    for (const attempt of [m[0], clean(m[0])]) {
      try { return fixParsed(JSON.parse(attempt)); } catch { /* continue */ }
    }
  }
  return null;
}

function fixParsed(p: Record<string, unknown>): unknown {
  if (typeof p.tool_calls === 'string') { try { p.tool_calls = JSON.parse(p.tool_calls); } catch { p.tool_calls = []; } }
  if (typeof p.blackboard_entry === 'string') { try { p.blackboard_entry = JSON.parse(p.blackboard_entry); } catch { p.blackboard_entry = null; } }
  return p;
}

// ─── Tool Execution ───────────────────────────────────────────────────────────

const TOOL_ROUTE_MAP: Record<string, string> = {
  get_time: 'time',
  brave_search: 'brave-search',
  google_search: 'google-search',
  web_scrape: 'web-scrape',
  read_github_repo: 'github',
  read_github_file: 'github',
  send_email: 'email',
  image_generation: 'run-nano',
  get_call_api: 'api-call',
  post_call_api: 'api-call',
  execute_sql: 'db',
  read_database_schemas: 'db',
  elevenlabs_tts: 'tts',
  get_weather: 'weather',
  read_zip_contents: 'zip',
  read_zip_file: 'zip',
  extract_zip_files: 'zip',
  pdf_info: 'pdf',
  pdf_extract_text: 'pdf',
  ocr_image: 'ocr',
};

async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  secretOverrides?: FreeAgentRequest['secretOverrides'],
  validToolNames?: Set<string>,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const baseToolName = toolName.includes(':') ? toolName.split(':')[0] : toolName;
  const route = TOOL_ROUTE_MAP[baseToolName];

  if (!route) {
    if (validToolNames?.has(baseToolName)) return { success: true, result: { frontend_handler: true, tool: toolName, params } };
    return { success: false, error: `Unknown tool "${toolName}"` };
  }

  const backendBase = `http://localhost:${process.env.PORT ?? 3000}`;
  let body = { ...params };

  // Inject secret overrides
  const secrets = secretOverrides?.[toolName] ?? secretOverrides?.[baseToolName];
  if (secrets?.params) {
    for (const [k, v] of Object.entries(secrets.params)) {
      body[k] = typeof v === 'object' && typeof body[k] === 'object' ? { ...(body[k] as object), ...(v as object) } : v;
    }
  }
  if (secrets?.headers) {
    body.headers = { ...(body.headers as object ?? {}), ...secrets.headers };
  }

  if (toolName === 'get_call_api') body.method = 'GET';
  else if (toolName === 'post_call_api') body.method = 'POST';
  else if (toolName === 'read_database_schemas') body.action = 'schemas';

  try {
    const res = await fetch(`${backendBase}/api/tools/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `${res.status}: ${errText.slice(0, 300)}` };
    }
    return { success: true, result: await res.json() };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function runFreeAgent(req: FastifyRequest, reply: FastifyReply) {
  const body = (req.body ?? {}) as FreeAgentRequest;
  const {
    prompt = '',
    model = 'gemini-2.5-flash',
    blackboard = [],
    previousToolResults = [],
    iteration = 1,
    scratchpad = '',
    assistanceResponse,
    secretOverrides,
    configuredParams,
    toolResultAttributes = {},
    artifacts = [],
    promptData,
    advancedFeatures,
    toolInstances,
  } = body;

  if (!promptData?.sections?.length) {
    return reply.code(400).send({ success: false, error: 'promptData is required' });
  }

  let systemPrompt: string;
  try {
    systemPrompt = buildSystemPrompt(body);
  } catch (err) {
    return reply.code(400).send({ success: false, error: err instanceof Error ? err.message : String(err) });
  }

  const llmResult = await callLLM(systemPrompt, prompt, model);
  if (!llmResult.success) {
    return reply.send({
      success: false, error: llmResult.error,
      debug: { systemPrompt, userPrompt: prompt, rawLLMResponse: '', model, scratchpadLength: scratchpad.length, blackboardEntries: blackboard.length, previousResultsCount: previousToolResults.length },
    });
  }

  const agentResponse = parseAgentResponse(llmResult.response!) as Record<string, unknown>;
  if (!agentResponse) {
    return reply.send({
      success: false, error: 'Failed to parse agent response',
      parseError: { rawResponse: llmResult.response, responseLength: llmResult.response?.length ?? 0, preview: llmResult.response?.slice(0, 500), ending: llmResult.response?.slice(-300) },
      debug: { systemPrompt, userPrompt: prompt, rawLLMResponse: llmResult.response ?? '', model },
    });
  }

  const validStatuses = ['in_progress', 'completed', 'needs_assistance', 'error'];
  if (!validStatuses.includes(agentResponse.status as string)) agentResponse.status = 'in_progress';

  const resolverCtx: ResolverContext = { scratchpad, blackboard, toolResultAttributes, artifacts };
  const validToolNames = new Set((promptData.toolDefinitions ?? []).map((t) => t.id).filter(Boolean));

  const toolResults: unknown[] = [];
  const frontendHandlers: unknown[] = [];

  for (const toolCall of (agentResponse.tool_calls as Array<{ tool: string; params: Record<string, unknown> }> ?? [])) {
    const resolved = resolveReferences(toolCall.params, resolverCtx) as Record<string, unknown>;
    const result = await executeTool(toolCall.tool, resolved, secretOverrides, validToolNames);
    if ((result.result as Record<string, unknown>)?.frontend_handler) {
      frontendHandlers.push({ tool: toolCall.tool, params: resolved });
    } else {
      toolResults.push({ tool: toolCall.tool, params: resolved, success: result.success, result: result.result, error: result.error });
    }
  }

  reply.send({
    success: true, iteration,
    response: agentResponse,
    toolResults, frontendHandlers,
    status: agentResponse.status,
    debug: {
      systemPrompt, userPrompt: prompt,
      fullPromptSent: `${systemPrompt}\n\nUser Task: ${prompt}`,
      rawLLMResponse: llmResult.response ?? '', model,
      scratchpadLength: scratchpad.length, blackboardEntries: blackboard.length, previousResultsCount: previousToolResults.length,
    },
  });
}
