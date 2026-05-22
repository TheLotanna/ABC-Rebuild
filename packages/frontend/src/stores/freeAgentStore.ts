import { defineStore } from 'pinia';
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import type {
  FreeAgentSession,
  BlackboardEntry,
  BlackboardCategory,
  ToolCall,
  FreeAgentArtifact,
  SessionFile,
  AssistanceRequest,
  FreeAgentMessage,
  AgentResponse,
  FinalReport,
  RawIterationData,
  ToolResult,
  ArtifactType,
  ToolResultAttribute,
  AdvancedFeatures,
  ChildSession,
} from '@agent-builder/shared';
import {
  executeFrontendTool,
  type ToolExecutionContext,
  type SpawnRequest,
} from '@/lib/freeAgentToolExecutor';
import {
  resolveReferences,
  getResolvedReferenceSummary,
  type ResolverContext,
} from '@/lib/referenceResolver';
import type { PromptDataPayload } from '@/lib/systemPromptBuilder';
import type { PromptCustomization } from '@agent-builder/shared';
import {
  isBinaryTool,
  detectBinaryContent,
  sanitizeBinaryResultForContext,
} from '@/lib/binaryToolUtils';
import { detectLoop, formatLoopDetectionResult, type LoopDetectorState } from '@/lib/loopDetector';
import { getFallbackTools, hasFallbackTools } from '@/lib/toolFallbacks';
import { formatPiiGuardMessage } from '@/lib/piiGuardClient';

const CACHEABLE_TOOLS = ['read_github_repo', 'read_github_file', 'web_scrape'];
const CACHE_TTL = 5 * 60 * 1000;
const AUTO_SAVE_TOOLS = [
  'brave_search', 'google_search', 'web_scrape',
  'read_github_repo', 'read_github_file',
  'get_call_api', 'post_call_api',
  'get_time', 'get_weather',
  'pdf_info', 'pdf_extract_text', 'ocr_image',
  'read_zip_contents', 'read_zip_file', 'extract_zip_files',
  'execute_sql', 'read_database_schemas',
  'image_generation', 'elevenlabs_tts',
  'send_email',
];
const MAX_RETRY_ATTEMPTS = 3;

interface CacheEntry {
  result: unknown;
  timestamp: number;
  params: Record<string, unknown>;
}

function getToolCacheKey(tool: string, params: Record<string, unknown>): string {
  return `${tool}:${JSON.stringify(params, Object.keys(params).sort())}`;
}

// One-time cleanup of legacy session storage
try { localStorage.removeItem('free_agent_sessions'); } catch { /* ignore */ }

export const useFreeAgentStore = defineStore('freeAgent', () => {
  // === Reactive state ===
  const session = ref<FreeAgentSession | null>(null);
  const isRunning = ref(false);
  const activeToolIds = ref<Set<string>>(new Set());

  // === Internal sync refs (not reactive — updated synchronously between iterations) ===
  let blackboard: BlackboardEntry[] = [];
  let scratchpad = '';
  let toolResultAttributes: Record<string, ToolResultAttribute> = {};
  let artifacts: FreeAgentArtifact[] = [];

  let toolCache = new Map<string, CacheEntry>();
  let iterationCount = 0;
  let retryCount = 0;
  let lastErrorIteration = 0;
  let maxIterations = 50;
  let shouldStop = false;
  let abortController: AbortController | null = null;
  let pendingInterject: string | null = null;
  let interjectResolver: (() => void) | null = null;
  let childSessionsMap = new Map<string, ChildSession>();
  let runningChildren = new Set<string>();
  let spawnRequest: SpawnRequest | null = null;
  let promptCustomization: PromptCustomization | null = null;
  let promptCustomizationChangeCallback: (() => void) | null = null;

  const baseUrl = () => import.meta.env.VITE_BACKEND_URL || '';

  // === State helpers ===

  function updateSession(updater: (prev: FreeAgentSession | null) => FreeAgentSession | null) {
    session.value = updater(session.value);
  }

  function handleArtifactCreated(artifact: FreeAgentArtifact) {
    artifacts = [...artifacts, artifact];
    updateSession(prev => prev ? { ...prev, artifacts: [...prev.artifacts, artifact] } : null);
  }

  function handleBlackboardUpdate(entry: BlackboardEntry) {
    blackboard = [...blackboard, entry];
    updateSession(prev => prev ? { ...prev, blackboard: [...prev.blackboard, entry] } : null);
  }

  function handleScratchpadUpdate(content: string) {
    scratchpad = content;
    updateSession(prev => prev ? { ...prev, scratchpad: content } : null);
  }

  function handleAttributeCreated(attribute: ToolResultAttribute) {
    toolResultAttributes = { ...toolResultAttributes, [attribute.name]: attribute };
    updateSession(prev => prev ? {
      ...prev,
      toolResultAttributes: { ...prev.toolResultAttributes, [attribute.name]: attribute },
    } : null);
  }

  function handleAssistanceNeeded(request: AssistanceRequest) {
    updateSession(prev => prev ? { ...prev, status: 'needs_assistance', assistanceRequest: request } : null);
    isRunning.value = false;
  }

  // === Iteration execution ===

  async function executeIteration(
    currentSession: FreeAgentSession,
    previousIterationResults: ToolResult[]
  ): Promise<{ continue: boolean; toolResults: ToolResult[]; hadError?: boolean; errorMessage?: string; spawnRequested?: boolean }> {
    if (iterationCount >= maxIterations) {
      toast.warning('Max iterations reached');
      return { continue: false, toolResults: [] };
    }

    iterationCount++;

    try {
      const assistanceResponse = currentSession.assistanceRequest?.respondedAt
        ? {
            response: currentSession.assistanceRequest.response,
            fileId: currentSession.assistanceRequest.fileId,
            selectedChoice: currentSession.assistanceRequest.selectedChoice,
          }
        : undefined;

      const currentBlackboard = blackboard.length > 0 ? blackboard : currentSession.blackboard;
      const currentScratchpad = scratchpad || currentSession.scratchpad || '';

      // Loop detection
      const availableAttributes = Object.keys(toolResultAttributes);
      const recentToolCalls: ToolCall[] = [];
      if (currentSession.rawData) {
        for (let i = Math.max(0, currentSession.rawData.length - 5); i < currentSession.rawData.length; i++) {
          const iter = currentSession.rawData[i];
          if (iter.toolCalls) {
            recentToolCalls.push(...iter.toolCalls.map((tc, idx) => ({
              id: `${iter.iteration}_${idx}`,
              tool: tc.tool,
              params: tc.params,
              status: 'completed' as const,
              startTime: iter.timestamp,
              iteration: iter.iteration,
            })));
          }
        }
      }

      const loopDetectorState: LoopDetectorState = {
        recentToolCalls,
        recentBlackboard: currentBlackboard,
        artifactsCount: currentSession.artifacts?.length || 0,
        scratchpadLength: currentScratchpad.length,
        previousArtifactsCount: currentSession.rawData?.slice(-2)?.[0]?.toolResults?.length || 0,
        previousScratchpadLength: currentSession.rawData?.slice(-2)?.[0]?.input?.scratchpadLength || 0,
        iteration: iterationCount,
      };

      const loopDetection = detectLoop(loopDetectorState, { blackboardWindow: 3, toolCallWindow: 3, enableSemanticSimilarity: false }, availableAttributes);
      if (loopDetection.detected && (loopDetection.level === 'force_break' || loopDetection.level === 'suggest')) {
        previousIterationResults.unshift(formatLoopDetectionResult(loopDetection));
      }

      const currentAttributes = toolResultAttributes;
      const currentArtifacts = currentSession.artifacts || [];

      // Call backend free-agent endpoint (replaces supabase.functions.invoke)
      const resp = await fetch(`${baseUrl()}/api/free-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController?.signal,
        body: JSON.stringify({
          prompt: currentSession.prompt,
          model: currentSession.model,
          blackboard: currentBlackboard.map(b => ({
            category: b.category, content: b.content, data: b.data, iteration: b.iteration, tools: b.tools,
          })),
          sessionFiles: currentSession.sessionFiles.map(f => ({
            id: f.id, filename: f.filename, mimeType: f.mimeType, size: f.size, content: f.content,
          })),
          previousToolResults: previousIterationResults,
          iteration: iterationCount,
          scratchpad: currentScratchpad,
          assistanceResponse,
          secretOverrides: currentSession.secretOverrides,
          configuredParams: currentSession.configuredParams,
          toolResultAttributes: Object.fromEntries(
            Object.entries(currentAttributes).map(([name, attr]) => [name, { result: attr.result, size: attr.size }])
          ),
          artifacts: currentArtifacts.map(a => ({
            id: a.id, type: a.type, title: a.title, content: a.content, description: a.description,
          })),
          promptData: currentSession.promptData,
          advancedFeatures: currentSession.advancedFeatures,
          toolInstances: currentSession.toolInstances,
        }),
      });

      const data = await resp.json();

      if (!data.success && !data.response) {
        const friendlyError = formatPiiGuardMessage(data.error || 'Free-agent request failed', data);
        const errorRawData: RawIterationData = {
          iteration: iterationCount,
          timestamp: new Date().toISOString(),
          input: {
            systemPrompt: data.debug?.systemPrompt || '',
            userPrompt: data.debug?.userPrompt || currentSession.prompt,
            fullPromptSent: data.debug?.fullPromptSent || '',
            model: currentSession.model,
            scratchpadLength: data.debug?.scratchpadLength || 0,
            blackboardEntries: data.debug?.blackboardEntries || 0,
            previousResultsCount: data.debug?.previousResultsCount || 0,
          },
          output: { rawLLMResponse: data.debug?.rawLLMResponse || '', parsedResponse: null, parseError: data.parseError || null, errorMessage: friendlyError },
          toolResults: [],
        };
        updateSession(prev => prev ? { ...prev, status: 'error', error: friendlyError, rawData: [...(prev.rawData || []), errorRawData], lastErrorIteration: iterationCount } : null);
        return { continue: false, toolResults: [], hadError: true, errorMessage: friendlyError };
      }

      const response = data.response as AgentResponse;

      // Normalize status
      const validStatuses = ['in_progress', 'completed', 'needs_assistance', 'error'];
      if (!response.status || !validStatuses.includes(response.status)) {
        response.status = 'in_progress';
      }

      const resolverContext: ResolverContext = {
        scratchpad: scratchpad || currentSession.scratchpad || '',
        blackboard: blackboard.length > 0 ? blackboard : currentSession.blackboard,
        attributes: toolResultAttributes,
        artifacts: currentSession.artifacts || [],
      };

      // Build tool calls with resolved params
      const newToolCalls: ToolCall[] = [];
      for (const tc of response.tool_calls || []) {
        activeToolIds.value = new Set([...activeToolIds.value, tc.tool]);
        const resolvedParams = resolveReferences(tc.params, resolverContext) as Record<string, unknown>;
        const summary = getResolvedReferenceSummary(tc.params, resolvedParams);
        if (summary.length > 0) console.log(`[Reference Resolution] ${tc.tool}:`, summary);
        newToolCalls.push({
          id: crypto.randomUUID(), tool: tc.tool, params: resolvedParams,
          status: 'executing', startTime: new Date().toISOString(), iteration: iterationCount,
        });
      }

      const iterationToolResults: ToolResult[] = [];

      // Process backend tool results
      for (const result of data.toolResults || []) {
        const toolCall = newToolCalls.find(t => t.tool === result.tool && t.status === 'executing');
        if (toolCall) {
          toolCall.status = result.success ? 'completed' : 'error';
          toolCall.result = result.result;
          toolCall.error = result.error;
          toolCall.endTime = new Date().toISOString();

          // Cache expensive successful results
          if (result.success && CACHEABLE_TOOLS.includes(result.tool)) {
            const cacheKey = getToolCacheKey(result.tool, toolCall.params || {});
            toolCache.set(cacheKey, { result: result.result, timestamp: Date.now(), params: toolCall.params || {} });
          }

          // Auto-save via saveAs parameter
          const saveAsName = toolCall.params?.saveAs as string | undefined;
          if (result.success && saveAsName) {
            const isImgTool = result.tool === 'image_generation' || result.tool === 'elevenlabs_tts';
            const imgResult = result.result as { imageUrl?: string; mimeType?: string } | undefined;
            const ttsResult = result.result as { audioContent?: string; mimeType?: string } | undefined;
            const isBinary = isImgTool && !!(imgResult?.imageUrl || ttsResult?.audioContent);
            const binaryMimeType = imgResult?.mimeType || ttsResult?.mimeType ||
              (result.tool === 'image_generation' ? 'image/png' : 'audio/mpeg');

            const resultString = isBinary
              ? `[Binary ${binaryMimeType} - ${Math.round((imgResult?.imageUrl?.length || ttsResult?.audioContent?.length || 0) / 1024)}KB]`
              : JSON.stringify(result.result, null, 2);

            const attribute: ToolResultAttribute = {
              id: crypto.randomUUID(), name: saveAsName, tool: result.tool, params: toolCall.params || {},
              result: result.result, resultString,
              size: isBinary ? (imgResult?.imageUrl?.length || ttsResult?.audioContent?.length || 0) : resultString.length,
              createdAt: new Date().toISOString(), iteration: iterationCount,
              isBinary: isBinary || undefined, mimeType: isBinary ? binaryMimeType : undefined,
            };
            handleAttributeCreated(attribute);

            const scratchpadEntry = isBinary
              ? `\n\n## ${saveAsName} (${binaryMimeType} from ${result.tool})\n[Binary content stored - ${Math.round(attribute.size / 1024)}KB]\nUse in pronghorn_post or other export tools.\n`
              : `\n\n## ${saveAsName} (from ${result.tool})\nData stored in attribute (${resultString.length} chars).\nAccess via: read_attribute({ names: ['${saveAsName}'] })\nPlaceholder: {{${saveAsName}}}\n\n**TODO: After reading, summarize key findings here.**`;
            handleScratchpadUpdate((scratchpad || '') + scratchpadEntry);

            const summaryResult = isBinary
              ? { _savedAsAttribute: saveAsName, _type: 'binary', _message: `Binary ${binaryMimeType} saved to attribute '${saveAsName}'.`, mimeType: binaryMimeType }
              : { _savedAsAttribute: saveAsName, _message: `Result saved to attribute '${saveAsName}' (${resultString.length} chars). NEXT STEP: Call read_attribute({ names: ['${saveAsName}'] }).` };

            iterationToolResults.push({ tool: result.tool, success: result.success, result: summaryResult, error: result.error });
            continue;
          }
        }
        iterationToolResults.push({ tool: result.tool, success: result.success, result: result.result, error: result.error });
      }

      // Handle frontend tools
      for (const handler of data.frontendHandlers || []) {
        const toolCall = newToolCalls.find(t => t.tool === handler.tool && t.status === 'executing');

        const context: ToolExecutionContext = {
          sessionId: currentSession.id,
          prompt: currentSession.prompt,
          scratchpad: scratchpad || currentSession.scratchpad || '',
          blackboard: blackboard.length > 0 ? blackboard : currentSession.blackboard,
          sessionFiles: currentSession.sessionFiles,
          toolResultAttributes,
          artifacts: artifacts.length > 0 ? artifacts : currentSession.artifacts,
          onArtifactCreated: handleArtifactCreated,
          onBlackboardUpdate: handleBlackboardUpdate,
          onScratchpadUpdate: handleScratchpadUpdate,
          onAssistanceNeeded: handleAssistanceNeeded,
          advancedFeatures: currentSession.advancedFeatures,
          promptCustomization: promptCustomization || undefined,
          onPromptCustomizationUpdate: (newCustomization) => {
            promptCustomization = newCustomization;
          },
          onPromptCustomizationChange: () => {
            if (promptCustomizationChangeCallback) promptCustomizationChangeCallback();
          },
          onSpawnChildren: (request) => {
            spawnRequest = request;
          },
        };

        const resolvedFrontendParams = resolveReferences(handler.params, resolverContext) as Record<string, unknown>;
        const result = await executeFrontendTool(handler.tool, resolvedFrontendParams, context);

        if (toolCall) {
          toolCall.status = result.success ? 'completed' : 'error';
          toolCall.result = result.result;
          toolCall.error = result.error;
          toolCall.endTime = new Date().toISOString();
        }

        let enhancedError = result.error;
        if (!result.success && result.error && hasFallbackTools(handler.tool)) {
          enhancedError = `${result.error}\n\nTIP: Try alternative tool(s): ${getFallbackTools(handler.tool).join(', ')}`;
        }

        iterationToolResults.push({ tool: handler.tool, success: result.success, result: result.result, error: enhancedError });

        // Auto-create image artifact
        if (result.success && handler.tool === 'image_generation' && result.result) {
          const imgResult = result.result as { imageUrl?: string; model?: string; mimeType?: string };
          if (imgResult.imageUrl) {
            handleArtifactCreated({
              id: crypto.randomUUID(), type: 'image',
              title: `Generated Image (Iteration ${iterationCount})`,
              content: imgResult.imageUrl,
              description: `Generated with ${imgResult.model || 'Gemini'}`,
              mimeType: imgResult.mimeType || 'image/png',
              createdAt: new Date().toISOString(), iteration: iterationCount,
            });
          }
        }

        // Auto-create audio artifact
        if (result.success && handler.tool === 'elevenlabs_tts' && result.result) {
          const ttsResult = result.result as { audioContent?: string; mimeType?: string };
          if (ttsResult.audioContent) {
            const mimeType = ttsResult.mimeType || 'audio/mpeg';
            const audioUrl = ttsResult.audioContent.startsWith('data:')
              ? ttsResult.audioContent
              : `data:${mimeType};base64,${ttsResult.audioContent}`;
            handleArtifactCreated({
              id: crypto.randomUUID(), type: 'audio',
              title: `Generated Audio (Iteration ${iterationCount})`,
              content: audioUrl,
              description: 'Text-to-speech audio generated with ElevenLabs',
              mimeType, createdAt: new Date().toISOString(), iteration: iterationCount,
            });
          }
        }

        if (handler.tool === 'request_assistance') return { continue: false, toolResults: iterationToolResults };

        if (handler.tool === 'spawn' && spawnRequest) {
          const spawnRawData: RawIterationData = {
            iteration: iterationCount, timestamp: new Date().toISOString(),
            input: { systemPrompt: data.debug?.systemPrompt || '', userPrompt: data.debug?.userPrompt || currentSession.prompt, fullPromptSent: data.debug?.fullPromptSent || '', model: currentSession.model, scratchpadLength: data.debug?.scratchpadLength || 0, blackboardEntries: data.debug?.blackboardEntries || 0, previousResultsCount: data.debug?.previousResultsCount || 0 },
            output: { rawLLMResponse: data.debug?.rawLLMResponse || '', parsedResponse: data.response },
            toolResults: iterationToolResults, toolCalls: response.tool_calls || [],
          };

          const spawnBlackboardEntry: BlackboardEntry = response.blackboard_entry
            ? { id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: response.blackboard_entry.category, content: `[#${iterationCount} ${response.blackboard_entry.category}] ${response.blackboard_entry.content}`, data: response.blackboard_entry.data, iteration: iterationCount }
            : { id: `auto_${iterationCount}_${Date.now()}`, category: 'decision' as BlackboardCategory, content: `[AUTO-LOGGED #${iterationCount}] Spawn requested.`, timestamp: new Date().toISOString(), iteration: iterationCount };
          handleBlackboardUpdate(spawnBlackboardEntry);

          updateSession(prev => prev ? { ...prev, currentIteration: iterationCount, toolCalls: [...prev.toolCalls, ...newToolCalls], rawData: [...(prev.rawData || []), spawnRawData], lastActivityTime: new Date().toISOString() } : null);
          return { continue: false, toolResults: iterationToolResults, spawnRequested: true };
        }
      }

      setTimeout(() => { activeToolIds.value = new Set(); }, 1000);

      const rawIterationData: RawIterationData = {
        iteration: iterationCount, timestamp: new Date().toISOString(),
        input: { systemPrompt: data.debug?.systemPrompt || '', userPrompt: data.debug?.userPrompt || currentSession.prompt, fullPromptSent: data.debug?.fullPromptSent || '', model: currentSession.model, scratchpadLength: data.debug?.scratchpadLength || 0, blackboardEntries: data.debug?.blackboardEntries || 0, previousResultsCount: data.debug?.previousResultsCount || 0 },
        output: { rawLLMResponse: data.debug?.rawLLMResponse || '', parsedResponse: data.response },
        toolResults: iterationToolResults, toolCalls: response.tool_calls || [],
      };

      // Auto-generate or use blackboard entry
      const iterationToolNames = newToolCalls.map(t => t.tool);
      const shouldAutoGenerate = (): boolean => {
        const entry = response.blackboard_entry;
        if (!entry || !entry.content || entry.content.trim().length < 20) return true;
        if (blackboard.length > 0) {
          const last = blackboard[blackboard.length - 1];
          const normalize = (s: string) => s.toLowerCase().replace(/\[#\d+\s*\w*\]/g, '').replace(/iteration\s*\d+/gi, '').trim();
          if (normalize(entry.content) === normalize(last.content)) return true;
        }
        return false;
      };

      let blackboardEntry: BlackboardEntry;
      if (shouldAutoGenerate()) {
        const toolCount = newToolCalls.length;
        const toolNames = newToolCalls.map(t => t.tool).slice(0, 5).join(', ');
        const status = data.status || 'in_progress';
        const parts: string[] = [`Status: ${status}`];
        if (toolCount > 0) parts.push(`Called: ${toolNames}${toolCount > 5 ? '...' : ''}`);
        const newAttrNames = newToolCalls.filter(t => t.params.saveAs).map(t => t.params.saveAs as string).slice(0, 3).join(', ');
        if (newAttrNames) parts.push(`Saved: ${newAttrNames}`);
        const growthDelta = scratchpad.length - (currentSession.rawData?.slice(-2)?.[0]?.input?.scratchpadLength || 0);
        if (growthDelta > 0) parts.push(`Scratchpad +${growthDelta} chars`);
        if (parts.length === 1) parts.push('No tools, attributes, or scratchpad updates');

        let category: BlackboardCategory = 'observation';
        if (newToolCalls.length > 0) category = 'decision';

        blackboardEntry = { id: `auto_${iterationCount}_${Date.now()}`, category, content: `[AUTO #${iterationCount}] ${parts.join(' | ')}`, timestamp: new Date().toISOString(), iteration: iterationCount, tools: iterationToolNames };
      } else {
        blackboardEntry = {
          id: crypto.randomUUID(), timestamp: new Date().toISOString(),
          category: response.blackboard_entry!.category,
          content: `[#${iterationCount} ${response.blackboard_entry!.category}] ${response.blackboard_entry!.content}`,
          data: response.blackboard_entry!.data, iteration: iterationCount, tools: iterationToolNames,
        };
      }
      handleBlackboardUpdate(blackboardEntry);

      const assistantMessage: FreeAgentMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: response.reasoning || response.message_to_user || '',
        timestamp: new Date().toISOString(), iteration: iterationCount,
      };

      const existingArtifactTitles = new Set(artifacts.map(a => a.title));
      const resolverCtx: ResolverContext = { scratchpad, blackboard, attributes: toolResultAttributes, artifacts };
      const newArtifacts: FreeAgentArtifact[] = (response.artifacts || [])
        .filter((a: FreeAgentArtifact) => !existingArtifactTitles.has(a.title))
        .map((a: FreeAgentArtifact) => ({
          id: crypto.randomUUID(), type: a.type,
          title: a.title, content: resolveReferences(a.content, resolverCtx) as string,
          description: a.description, createdAt: new Date().toISOString(), iteration: iterationCount,
        }));

      if (newArtifacts.length > 0) artifacts = [...artifacts, ...newArtifacts];

      // Auto-create summary artifact on completion
      if (response.status === 'completed' && newArtifacts.length === 0) {
        const summaryParts: string[] = [];
        if (response.final_report?.summary) summaryParts.push(`## Summary\n\n${response.final_report.summary}`);
        if (response.final_report?.key_findings?.length) summaryParts.push(`\n\n## Key Findings\n\n${response.final_report.key_findings.map((f: string) => `- ${f}`).join('\n')}`);
        if (response.message_to_user) summaryParts.push(`\n\n## Agent Response\n\n${response.message_to_user}`);
        const autoContent = summaryParts.join('') || response.reasoning || 'Task completed successfully.';
        if (autoContent.length > 20) {
          newArtifacts.push({ id: crypto.randomUUID(), type: 'text' as ArtifactType, title: 'Task Summary', content: autoContent, description: 'Auto-generated summary from agent completion', createdAt: new Date().toISOString(), iteration: iterationCount });
        }
      }

      updateSession(prev => prev ? {
        ...prev, currentIteration: iterationCount,
        toolCalls: [...prev.toolCalls, ...newToolCalls],
        messages: [...prev.messages, assistantMessage],
        artifacts: [...prev.artifacts, ...newArtifacts],
        lastActivityTime: new Date().toISOString(),
        assistanceRequest: assistanceResponse ? undefined : prev.assistanceRequest,
        rawData: [...(prev.rawData || []), rawIterationData],
      } : null);

      if (response.status === 'completed') {
        const finalReport: FinalReport = {
          summary: response.final_report?.summary || 'Task completed',
          toolsUsed: response.final_report?.tools_used || [],
          artifactsCreated: (response.final_report?.artifacts_created || []).map((a: string | { title?: string; description?: string }) => ({
            title: typeof a === 'string' ? a : (a.title || 'Unnamed'),
            description: typeof a === 'string' ? '' : (a.description || ''),
            artifactId: '',
          })),
          keyFindings: response.final_report?.key_findings || [],
          totalIterations: iterationCount,
          totalTime: Date.now() - new Date(currentSession.startTime).getTime(),
        };
        updateSession(prev => prev ? { ...prev, status: 'completed', finalReport, endTime: new Date().toISOString() } : null);
        toast.success('Free Agent completed the task!');
        return { continue: false, toolResults: iterationToolResults };
      } else if (response.status === 'needs_assistance') {
        return { continue: false, toolResults: iterationToolResults };
      } else if (response.status === 'error') {
        updateSession(prev => prev ? { ...prev, status: 'error', error: response.reasoning } : null);
        toast.error('Free Agent encountered an error');
        return { continue: false, toolResults: iterationToolResults };
      }

      return { continue: true, toolResults: iterationToolResults };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateSession(prev => prev ? { ...prev, status: 'error', error: errorMessage, lastErrorIteration: iterationCount } : null);
      return { continue: false, toolResults: [], hadError: true, errorMessage };
    }
  }

  // === Child session execution ===

  async function runChildSession(
    child: ChildSession,
    parentSession: FreeAgentSession,
    parentPromptData: FreeAgentSession['promptData'],
    onUpdate: (child: ChildSession) => void,
    onToolActive?: (toolId: string, active: boolean) => void
  ) {
    let childIteration = 0;
    let lastToolResults: ToolResult[] = [];
    let childScratchpad = child.scratchpad;
    let childBlackboard = [...child.blackboard];
    let childToolCalls = [...child.toolCalls];
    let childArtifacts = [...child.artifacts];
    let childAttributes: Record<string, ToolResultAttribute> = { ...child.toolResultAttributes };
    let childRawData: RawIterationData[] = [...(child.rawData || [])];

    const childPromptData: FreeAgentSession['promptData'] = parentPromptData ? {
      toolOverrides: parentPromptData.toolOverrides,
      disabledTools: parentPromptData.disabledTools,
      toolDefinitions: parentPromptData.toolDefinitions,
      sections: parentPromptData.sections.map(section => {
        if (section.id === 'user_task') {
          return {
            ...section,
            content: `<prompt-section id="user_task" type="task">\n## CHILD AGENT TASK: ${child.name}\n\n${child.task}\n\n### ⚠️ CHILD AGENT CRITICAL RULES:\n**1. PROGRESS TRACKING:** Write "✅ COMPLETED: [item]" in blackboard for EACH item.\n**2. LOOP PREVENTION:** Before calling a tool, check: "Did I already call this with these params?"\n**3. COMPLETION:** Set status to "completed" when ALL items done.\n**4. EFFICIENCY:** You have MAX ${child.maxIterations} iterations.\n</prompt-section>`,
          };
        }
        return section;
      }),
    } : undefined;

    while (childIteration < child.maxIterations && !shouldStop) {
      childIteration++;
      const updatedChild: ChildSession = { ...child, currentIteration: childIteration, blackboard: childBlackboard, scratchpad: childScratchpad, toolCalls: childToolCalls, artifacts: childArtifacts, toolResultAttributes: childAttributes, rawData: childRawData };
      onUpdate(updatedChild);

      try {
        const resp = await fetch(`${baseUrl()}/api/free-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: child.task, model: parentSession.model,
            blackboard: childBlackboard.map(b => ({ category: b.category, content: b.content, data: b.data, iteration: b.iteration, tools: b.tools })),
            sessionFiles: parentSession.sessionFiles.map(f => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, size: f.size, content: f.content })),
            previousToolResults: lastToolResults, iteration: childIteration, scratchpad: childScratchpad,
            secretOverrides: parentSession.secretOverrides, configuredParams: parentSession.configuredParams,
            toolResultAttributes: Object.fromEntries(Object.entries(childAttributes).map(([n, a]) => [n, { result: a.result, size: a.size }])),
            artifacts: childArtifacts.map(a => ({ id: a.id, type: a.type, title: a.title, content: a.content, description: a.description })),
            promptData: childPromptData, advancedFeatures: undefined,
          }),
        });
        const data = await resp.json();

        if (!data.success) {
          const childErr = formatPiiGuardMessage(data.error || 'Unknown error', data);
          childBlackboard.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'error', content: `Error at iteration ${childIteration}: ${childErr}`, iteration: childIteration });
          continue;
        }

        const response = data.response as AgentResponse;
        childRawData.push({
          iteration: childIteration, timestamp: new Date().toISOString(),
          input: { model: parentSession.model || 'unknown', userPrompt: child.task, systemPrompt: data.debug?.fullPromptSent || '', fullPromptSent: data.debug?.fullPromptSent || '', scratchpadLength: childScratchpad.length, blackboardEntries: childBlackboard.length, previousResultsCount: lastToolResults.length },
          output: { rawLLMResponse: data.debug?.rawLLMResponse || '', parsedResponse: data.parsed || response, parseError: data.parseError, errorMessage: data.error },
          toolResults: (data.toolResults || []).map((tr: ToolResult) => ({ tool: tr.tool, success: tr.success, result: tr.result, error: tr.error })),
          toolCalls: response.tool_calls || [],
        });

        const iterationToolResults: ToolResult[] = [];
        const iterationToolNames: string[] = [];

        for (const result of data.toolResults || []) {
          iterationToolNames.push(result.tool);
          const toolCall: ToolCall = { id: crypto.randomUUID(), tool: result.tool, params: result.params || {}, status: result.success ? 'completed' : 'error', result: result.result, error: result.error, startTime: new Date().toISOString(), endTime: new Date().toISOString(), iteration: childIteration };
          childToolCalls.push(toolCall);
          if (onToolActive) onToolActive(result.tool, true);

          const baseTool = result.tool.includes(':') ? result.tool.split(':')[0] : result.tool;
          if (result.success && AUTO_SAVE_TOOLS.includes(baseTool)) {
            const explicitSaveAs = toolCall.params?.saveAs as string | undefined;
            const keyParam = toolCall.params?.location || toolCall.params?.query || toolCall.params?.url || toolCall.params?.path || '';
            const paramSlug = String(keyParam).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
            const autoName = explicitSaveAs || (paramSlug ? `${result.tool}_${paramSlug}` : `${result.tool}_${childIteration}_${childToolCalls.length}`);
            const binaryInfo = detectBinaryContent(result.tool, result.result);
            const resultString = binaryInfo.isBinary ? binaryInfo.summary : JSON.stringify(result.result, null, 2);
            childAttributes[autoName] = { id: crypto.randomUUID(), name: autoName, tool: result.tool, params: toolCall.params || {}, result: result.result, resultString, size: binaryInfo.isBinary ? binaryInfo.size : resultString.length, createdAt: new Date().toISOString(), iteration: childIteration, isBinary: binaryInfo.isBinary || undefined, mimeType: binaryInfo.mimeType };
            const keyParamValue = toolCall.params?.location || toolCall.params?.query || toolCall.params?.url || '';
            childScratchpad = childScratchpad + `\n\n## ✅ COMPLETED: ${autoName}${keyParamValue ? ` for "${keyParamValue}"` : ''}\n**Tool:** ${result.tool}\n**Status:** Data saved.\nAccess via: read_attribute({ names: ['${autoName}'] })\n`;
          }

          const sanitizedResult = isBinaryTool(result.tool) ? sanitizeBinaryResultForContext(result.tool, result.result) : result.result;
          iterationToolResults.push({ tool: result.tool, success: result.success, result: sanitizedResult, error: result.error });
        }

        if (response.blackboard_entry) {
          childBlackboard.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: response.blackboard_entry.category as BlackboardCategory, content: response.blackboard_entry.content, data: response.blackboard_entry.data, iteration: childIteration, tools: iterationToolNames });
        }

        if (response.artifacts?.length > 0) {
          childArtifacts.push(...response.artifacts.map((a: FreeAgentArtifact) => ({ id: crypto.randomUUID(), type: a.type as ArtifactType, title: a.title, content: a.content, description: a.description || `Created by ${child.name}`, createdAt: new Date().toISOString(), iteration: childIteration })));
        }

        // Process frontend handlers for child
        for (const handler of data.frontendHandlers || []) {
          if (onToolActive) { onToolActive(handler.tool, true); setTimeout(() => onToolActive(handler.tool, false), 1000); }
          childToolCalls.push({ id: crypto.randomUUID(), tool: handler.tool, params: handler.params || {}, status: 'completed', startTime: new Date().toISOString(), endTime: new Date().toISOString(), iteration: childIteration });
          if (handler.tool === 'write_scratchpad') {
            const mode = (handler.params.mode as string) || 'append';
            childScratchpad = mode === 'append' ? childScratchpad + (childScratchpad ? '\n\n' : '') + handler.params.content : handler.params.content as string;
            iterationToolResults.push({ tool: handler.tool, success: true, result: { success: true, length: childScratchpad.length } });
          } else if (handler.tool === 'write_blackboard') {
            const entry: BlackboardEntry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: (handler.params.category as BlackboardCategory) || 'observation', content: handler.params.content as string, data: handler.params.data as Record<string, unknown> | undefined, iteration: childIteration, tools: iterationToolNames };
            childBlackboard.push(entry);
            iterationToolResults.push({ tool: handler.tool, success: true, result: { id: entry.id, success: true } });
          } else if (handler.tool === 'read_scratchpad') {
            iterationToolResults.push({ tool: handler.tool, success: true, result: { content: childScratchpad } });
          } else if (handler.tool === 'read_attribute') {
            const names = handler.params.names as string[] || [];
            const found: Record<string, unknown> = {};
            const notFound: string[] = [];
            for (const name of names) {
              if (childAttributes[name]) found[name] = childAttributes[name].result;
              else notFound.push(name);
            }
            iterationToolResults.push({ tool: handler.tool, success: true, result: { ...found, ...(notFound.length > 0 ? { _notFound: notFound, _hint: `Not found: [${notFound.join(', ')}]. Available: [${Object.keys(childAttributes).join(', ') || 'none'}]` } : {}) } });
          } else if (handler.tool === 'read_blackboard') {
            iterationToolResults.push({ tool: handler.tool, success: true, result: { entries: childBlackboard } });
          } else {
            iterationToolResults.push({ tool: handler.tool, success: true, result: { handled: false } });
          }
        }

        // Child loop detection
        if (childBlackboard.length >= 2) {
          const recent = childBlackboard.slice(-3);
          const normalized = recent.map(e => e.content.toLowerCase().replace(/step\s*\d+:?/gi, '').replace(/\s+/g, ' ').trim());
          const last2 = normalized.slice(-2);
          const isDuplicate = last2.length === 2 && last2[0] === last2[1];
          if (isDuplicate) {
            iterationToolResults.unshift({ tool: '_system_loop_warning', success: true, result: { warning: '⚠️ LOOP DETECTED - YOU ARE REPEATING THE SAME ACTION!', savedAttributes: Object.keys(childAttributes).join(', ') || 'none', action: 'Check savedAttributes above and MOVE ON or complete.' } });
          }
        }

        lastToolResults = iterationToolResults;

        if (response.status === 'completed') {
          onUpdate({ ...child, status: 'completed', currentIteration: childIteration, endTime: new Date().toISOString(), blackboard: childBlackboard, scratchpad: childScratchpad, toolCalls: childToolCalls, artifacts: childArtifacts, toolResultAttributes: childAttributes, rawData: childRawData });
          return;
        }
        if (response.status === 'error') {
          onUpdate({ ...child, status: 'error', currentIteration: childIteration, endTime: new Date().toISOString(), blackboard: childBlackboard, scratchpad: childScratchpad, toolCalls: childToolCalls, artifacts: childArtifacts, toolResultAttributes: childAttributes, rawData: childRawData, error: response.message_to_user || 'Child agent error' });
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        childBlackboard.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), category: 'error', content: `Exception at iteration ${childIteration}: ${String(err)}`, iteration: childIteration });
      }
    }

    onUpdate({ ...child, status: 'completed', currentIteration: childIteration, endTime: new Date().toISOString(), blackboard: childBlackboard, scratchpad: childScratchpad, toolCalls: childToolCalls, artifacts: childArtifacts, toolResultAttributes: childAttributes, rawData: childRawData });
  }

  // === Iteration loop ===

  async function runIterationLoop(sessionId: string, initialSession: FreeAgentSession, initialToolResults: ToolResult[] = []) {
    let shouldContinue = true;
    let lastToolResults = initialToolResults;

    while (shouldContinue && !shouldStop && iterationCount < maxIterations) {
      if (pendingInterject !== null) {
        await new Promise<void>(resolve => { interjectResolver = resolve; });
        interjectResolver = null;
      }
      if (shouldStop) break;

      const result = await executeIteration(initialSession, lastToolResults);

      if (result.hadError) {
        retryCount++;
        lastErrorIteration = iterationCount;

        if (retryCount < MAX_RETRY_ATTEMPTS) {
          iterationCount--;
          toast.warning(`Retrying iteration (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})...`);
          updateSession(prev => prev ? { ...prev, status: 'running', retryCount, lastErrorIteration } : null);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          toast.error(`Failed after ${MAX_RETRY_ATTEMPTS} attempts. Click Retry to try again.`);
          updateSession(prev => prev ? { ...prev, status: 'paused', error: result.errorMessage, retryCount, lastErrorIteration } : null);
          shouldContinue = false;
          break;
        }
      } else {
        retryCount = 0;
      }

      if (result.spawnRequested && spawnRequest) {
        const req = spawnRequest;
        spawnRequest = null;
        const parentPromptData = initialSession.promptData;

        const childSessions: ChildSession[] = req.children.map(child => ({
          id: crypto.randomUUID(), name: child.name, task: child.task, status: 'running' as const,
          promptModifications: [{ type: 'set_task' as const, content: child.task }, ...(child.sectionOverrides ? Object.entries(child.sectionOverrides).map(([sectionId, content]) => ({ type: 'override_section' as const, sectionId, content })) : [])],
          maxIterations: child.maxIterations || initialSession.advancedFeatures?.childMaxIterations || 20,
          currentIteration: 0, startTime: new Date().toISOString(),
          blackboard: [], scratchpad: req.parentScratchpad, toolCalls: [], artifacts: [],
          toolResultAttributes: { ...req.parentAttributes }, rawData: [],
        }));

        activeToolIds.value = new Set([...activeToolIds.value, 'spawn']);
        updateSession(prev => prev ? { ...prev, status: 'waiting', orchestration: { role: 'orchestrator', children: childSessions, awaitingChildren: true, completionThreshold: req.completionThreshold } } : null);

        for (const child of childSessions) { childSessionsMap.set(child.name, child); runningChildren.add(child.name); }
        toast.info(`Spawning ${childSessions.length} child agents...`);

        await Promise.all(childSessions.map(async (child) => {
          try {
            await runChildSession(child, initialSession, parentPromptData, (updatedChild) => {
              childSessionsMap.set(child.name, updatedChild);
              updateSession(prev => {
                if (!prev?.orchestration?.children) return prev;
                return { ...prev, status: 'waiting' as const, orchestration: { ...prev.orchestration, awaitingChildren: true, children: prev.orchestration.children.map(c => c.name === child.name ? updatedChild : c) } };
              });
            }, (toolId, active) => {
              if (active) activeToolIds.value = new Set([...activeToolIds.value, toolId]);
              else { const next = new Set(activeToolIds.value); next.delete(toolId); activeToolIds.value = next; }
            });
            return { name: child.name, success: true };
          } catch (error) { return { name: child.name, success: false, error: String(error) }; }
        }));

        // Merge child results to parent
        for (const child of childSessions) {
          runningChildren.delete(child.name);
          const finalChild = childSessionsMap.get(child.name);
          if (!finalChild) continue;

          for (const entry of finalChild.blackboard) {
            handleBlackboardUpdate({ ...entry, id: crypto.randomUUID(), content: `[CHILD:${child.name}] ${entry.content}` });
          }
          if (finalChild.scratchpad && finalChild.scratchpad.length > req.parentScratchpad.length) {
            const additions = finalChild.scratchpad.slice(req.parentScratchpad.length);
            if (additions.trim()) handleScratchpadUpdate(scratchpad + `\n\n## [${child.name}] Results\n${additions}`);
          }
          for (const [name, attr] of Object.entries(finalChild.toolResultAttributes || {})) {
            handleAttributeCreated({ ...attr, id: crypto.randomUUID(), name: `${child.name}_${name}` });
          }
          for (const artifact of finalChild.artifacts || []) {
            const prefixed = { ...artifact, id: crypto.randomUUID(), title: `[${child.name}] ${artifact.title}`, description: `${artifact.description || ''} (from child: ${child.name})`.trim() };
            artifacts = [...artifacts, prefixed];
            updateSession(prev => prev ? { ...prev, artifacts: [...prev.artifacts, prefixed] } : null);
          }
        }

        updateSession(prev => {
          if (!prev) return null;
          return { ...prev, status: 'running', orchestration: { ...prev.orchestration!, awaitingChildren: false, children: (prev.orchestration?.children || []).map(child => childSessionsMap.get(child.name) || child) } };
        });

        const next = new Set(activeToolIds.value); next.delete('spawn'); activeToolIds.value = next;
        shouldContinue = true;
        lastToolResults = [{ tool: 'spawn', success: true, result: { message: 'Children completed.' } }];
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      shouldContinue = result.continue;
      lastToolResults = result.toolResults;
      if (shouldContinue && !shouldStop) await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // === Public actions ===

  async function startSession(
    prompt: string,
    files: SessionFile[] = [],
    model = 'gemini-2.5-flash',
    maxIter = 50,
    existingSession?: FreeAgentSession | null,
    secretOverrides?: FreeAgentSession['secretOverrides'],
    configuredParams?: FreeAgentSession['configuredParams'],
    promptData?: PromptDataPayload,
    advancedFeatures?: AdvancedFeatures,
    promptCustomizationArg?: PromptCustomization | null,
    onPromptCustomizationChange?: () => void,
    toolInstances?: FreeAgentSession['toolInstances']
  ) {
    try {
      isRunning.value = true;
      iterationCount = 0; retryCount = 0; lastErrorIteration = 0;
      maxIterations = maxIter; pendingInterject = null;
      promptCustomization = promptCustomizationArg || null;
      promptCustomizationChangeCallback = onPromptCustomizationChange || null;

      const newSession: FreeAgentSession = {
        id: existingSession?.id || crypto.randomUUID(),
        status: 'running', prompt, model, maxIterations: maxIter, currentIteration: 0,
        blackboard: existingSession?.blackboard || [],
        scratchpad: existingSession?.scratchpad || '',
        artifacts: existingSession?.artifacts || [],
        toolCalls: [],
        messages: [{ id: crypto.randomUUID(), role: 'user', content: prompt, timestamp: new Date().toISOString() }],
        toolResultAttributes: existingSession?.toolResultAttributes || {},
        sessionFiles: files,
        startTime: new Date().toISOString(),
        lastActivityTime: new Date().toISOString(),
        rawData: existingSession?.rawData || [],
        retryCount: 0,
        secretOverrides: secretOverrides || existingSession?.secretOverrides,
        configuredParams: configuredParams || existingSession?.configuredParams,
        promptData: promptData || existingSession?.promptData,
        advancedFeatures: advancedFeatures || existingSession?.advancedFeatures,
        toolInstances: toolInstances || existingSession?.toolInstances,
      };

      blackboard = newSession.blackboard;
      scratchpad = newSession.scratchpad;
      toolResultAttributes = newSession.toolResultAttributes;
      artifacts = newSession.artifacts;
      if (!existingSession) toolCache.clear();

      session.value = newSession;
      shouldStop = false;
      abortController = new AbortController();

      await runIterationLoop(newSession.id, newSession);
      isRunning.value = false;
      return newSession.id;
    } catch (error) {
      console.error('Failed to start session:', error);
      toast.error('Failed to start Free Agent session');
      isRunning.value = false;
      throw error;
    }
  }

  async function respondToAssistance(response: { response?: string; fileId?: string; selectedChoice?: string }) {
    if (!session.value) return;
    try {
      isRunning.value = true;
      retryCount = 0;

      const userMessage: FreeAgentMessage = {
        id: crypto.randomUUID(), role: 'user',
        content: response.response || response.selectedChoice || '[File provided]',
        timestamp: new Date().toISOString(), iteration: iterationCount,
      };

      const updatedSession: FreeAgentSession = {
        ...session.value, status: 'running',
        messages: [...session.value.messages, userMessage],
        assistanceRequest: session.value.assistanceRequest ? { ...session.value.assistanceRequest, response: response.response, fileId: response.fileId, selectedChoice: response.selectedChoice, respondedAt: new Date().toISOString() } : undefined,
        retryCount: 0,
      };
      session.value = updatedSession;

      shouldStop = false;
      await runIterationLoop(session.value.id, updatedSession);
      isRunning.value = false;
    } catch (error) {
      toast.error('Failed to continue after assistance');
      isRunning.value = false;
    }
  }

  async function retrySession() {
    if (!session.value) return;
    try {
      isRunning.value = true;
      retryCount = 0;
      if (session.value.lastErrorIteration && session.value.lastErrorIteration > 0) {
        iterationCount = session.value.lastErrorIteration - 1;
      }
      const updatedSession: FreeAgentSession = { ...session.value, status: 'running', error: undefined, retryCount: 0 };
      session.value = updatedSession;
      toast.info('Retrying from last failed iteration...');
      shouldStop = false;
      await runIterationLoop(session.value.id, updatedSession);
      isRunning.value = false;
    } catch {
      toast.error('Failed to retry session');
      isRunning.value = false;
    }
  }

  function stopSession() {
    shouldStop = true;
    abortController?.abort();
    isRunning.value = false;
    updateSession(prev => prev ? { ...prev, status: 'idle' } : null);
  }

  function resetSession() {
    shouldStop = true;
    abortController?.abort();
    session.value = null;
    isRunning.value = false;
    activeToolIds.value = new Set();
    iterationCount = 0; blackboard = []; scratchpad = ''; toolResultAttributes = {}; artifacts = [];
    retryCount = 0; lastErrorIteration = 0; toolCache.clear();
  }

  function continueSession() {
    if (!session.value) return;
    updateSession(prev => prev ? { ...prev, status: 'idle', toolCalls: [], messages: [] } : null);
    iterationCount = 0;
  }

  function updateScratchpad(content: string) {
    handleScratchpadUpdate(content);
  }

  function getCacheSize(): number {
    return toolCache.size;
  }

  function interjectSession(message: string) {
    if (!session.value || !isRunning.value) return;
    const entry: BlackboardEntry = {
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      category: 'user_interjection',
      content: `[USER INTERJECTION] ${message}`,
      iteration: iterationCount,
    };
    handleBlackboardUpdate(entry);
    if (iterationCount > 0) iterationCount--;
    toast.success('Interjection added. Agent will re-run current iteration with your input.');
    pendingInterject = null;
    if (interjectResolver) interjectResolver();
  }

  return {
    session,
    isRunning,
    activeToolIds,
    startSession,
    respondToAssistance,
    stopSession,
    resetSession,
    continueSession,
    retrySession,
    updateScratchpad,
    getCacheSize,
    interjectSession,
  };
});
