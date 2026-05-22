import { useWorkflowStore } from '@/stores/workflowStore';
import { FunctionExecutor } from '@/lib/functionExecutor';
import { formatPiiGuardMessage } from '@/lib/piiGuardClient';
import { toast } from 'vue-sonner';
import type { AgentNode, FunctionNode } from '@agent-builder/shared';

/**
 * The backend's generic PII-block message starts with this prefix. We use
 * substring detection (rather than rethrowing a typed error) because the
 * runner catches in many places and the block can arrive on either the
 * JSON 400 path or the SSE error event.
 */
const PII_BLOCK_PREFIX = 'Request blocked by PII guard';

function maybeToastPiiBlock(prefix: string, error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (!msg.includes(PII_BLOCK_PREFIX)) return false;
  // The formatter renders "<base> — detected: <kinds>"; pull the detail half
  // into the toast description if present.
  const idx = msg.indexOf(' — detected: ');
  const description = idx >= 0 ? msg.slice(idx + ' — detected: '.length) : msg;
  toast.error(prefix, { description });
  return true;
}

const backendBase = () => (import.meta as any).env.VITE_BACKEND_URL || '';

function isNullLikeValue(value: string): boolean {
  if (!value || value.trim() === '') return true;
  const lower = value.toLowerCase().trim();
  return lower === 'null' || lower === 'undefined' || lower === 'none' || lower === 'n/a';
}

function resolveAgentEndpoint(model: string): string {
  if (model.startsWith('claude-')) return `${backendBase()}/api/run-agent/anthropic`;
  if (model.startsWith('grok-')) return `${backendBase()}/api/run-agent/xai`;
  return `${backendBase()}/api/run-agent`;
}

export function useWorkflowRunner() {
  const store = useWorkflowStore();

  async function streamAgentResponse(
    nodeId: string,
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      // The PII guard returns JSON 400 with { error, piiGuard: { findings } }
      // BEFORE any SSE init. Try to parse so the user sees what was detected;
      // fall back to raw text when the body isn't JSON (or is empty).
      let parsed: unknown = null;
      if (errText) {
        try {
          parsed = JSON.parse(errText);
        } catch {
          parsed = null;
        }
      }
      const baseMsg =
        (parsed && typeof parsed === 'object' &&
          ((parsed as { error?: string }).error || (parsed as { message?: string }).message)) ||
        errText ||
        `Server error: ${response.status}`;
      throw new Error(formatPiiGuardMessage(baseMsg, parsed));
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body reader');

    const decoder = new TextDecoder();
    let accumulated = '';
    let textBuffer = '';
    let lastUpdate = Date.now();
    let isFirstDelta = true;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;
        while ((newlineIdx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIdx);
          textBuffer = textBuffer.slice(newlineIdx + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === 'tools' && parsed.toolOutputs) {
              parsed.toolOutputs.forEach((to: any) => {
                store.addLog('info', `Tool Output [${to.toolId}]: ${JSON.stringify(to.output, null, 2)}`);
              });
            } else if (parsed.type === 'delta' && parsed.text) {
              if (isFirstDelta) {
                store.updateNode(nodeId, { output: '' });
                isFirstDelta = false;
              }
              accumulated += parsed.text;
              const now = Date.now();
              if (now - lastUpdate > 100) {
                store.updateNode(nodeId, { output: accumulated });
                lastUpdate = now;
              }
            } else if (parsed.type === 'done' && parsed.truncated) {
              store.addLog('warning', `Response was truncated (${parsed.finishReason})`);
            } else if (parsed.type === 'error') {
              const baseMsg = parsed.error || parsed.message || 'Stream error';
              throw new Error(formatPiiGuardMessage(baseMsg, parsed));
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
      store.updateNode(nodeId, { output: accumulated });
      return accumulated;
    } finally {
      reader.releaseLock();
    }
  }

  async function executeAgentOnce(
    nodeId: string,
    agent: AgentNode,
    customInput?: string,
    portOverride?: { nodeId: string; port: string },
  ): Promise<string> {
    const allNodes = store.allNodes;

    // Null-input guard
    if (!agent.executeOnNullInput && customInput === undefined && !portOverride) {
      const incomingConns = store.workflow.connections.filter(c => c.toNodeId === nodeId);
      const isStage1 = store.workflow.stages[0]?.nodes.some(n => n.id === agent.id);
      let checkInput = '';
      if (incomingConns.length > 0) {
        const outs = incomingConns
          .map(c => {
            const fromNode = allNodes.find(n => n.id === c.fromNodeId);
            if (!fromNode) return '';
            if (fromNode.nodeType === 'function') {
              const fn = fromNode as FunctionNode;
              const port = c.fromOutputPort || Object.keys(fn.outputs || {})[0] || 'output';
              return fn.outputs?.[port] !== undefined ? String(fn.outputs[port]) : '';
            }
            return fromNode.output || '';
          })
          .filter(v => v.trim().length > 0);
        checkInput = outs.join('\n\n---\n\n');
      } else if (isStage1) {
        checkInput = store.userInput || '';
      }

      if (isNullLikeValue(checkInput)) {
        store.addLog('warning', `Agent "${agent.name}" skipped — input is null and "Execute on NULL Input" is disabled`);
        store.updateNode(nodeId, { status: 'idle', output: '' });
        return '';
      }
    }

    store.addLog('info', `Starting agent: ${agent.name}`);
    store.updateNode(nodeId, { status: 'running' });

    try {
      const allNodes = store.allNodes;
      const isStage1 = store.workflow.stages[0]?.nodes.some(n => n.id === agent.id);
      const incomingConns = store.workflow.connections.filter(c => c.toNodeId === nodeId);
      let input = '';

      if (portOverride) {
        const fromNode = allNodes.find(n => n.id === portOverride.nodeId);
        if (fromNode) {
          if (fromNode.nodeType === 'function') {
            input = (fromNode as FunctionNode).outputs?.[portOverride.port] || '';
          } else if (fromNode.nodeType === 'agent') {
            input = (fromNode as AgentNode).beastModeOutputs?.[portOverride.port] || fromNode.output || '';
          } else {
            input = fromNode.output || '';
          }
        }
      } else if (customInput !== undefined) {
        input = customInput;
      } else if (incomingConns.length > 0) {
        const outs = incomingConns
          .map(c => {
            const fromNode = allNodes.find(n => n.id === c.fromNodeId);
            if (!fromNode) return '';
            let port = c.fromOutputPort;
            if (!port && fromNode.nodeType === 'function') {
              const fn = fromNode as FunctionNode;
              port = fn.outputs ? Object.keys(fn.outputs)[0] || 'output' : 'output';
            }
            if (fromNode.nodeType === 'function' && port) {
              const v = (fromNode as FunctionNode).outputs?.[port];
              return v !== undefined && v !== null ? String(v) : '';
            }
            if (fromNode.nodeType === 'agent' && port) {
              const an = fromNode as AgentNode;
              if (an.beastModeOutputs?.[port]) return an.beastModeOutputs[port];
            }
            return fromNode.output || '';
          })
          .filter(v => v.trim().length > 0);
        if (outs.length > 0) {
          input = outs.join('\n\n---\n\n');
          store.addLog('info', `Agent ${agent.name} received input from ${incomingConns.length} connection(s)`);
        }
      } else if (isStage1) {
        input = store.userInput || '';
      }

      const effectiveModel =
        agent.useSpecificModel && agent.model ? agent.model : store.selectedModel;
      const effectiveResponseLength =
        agent.useSpecificModel && agent.responseLength ? agent.responseLength : store.responseLength;
      const effectiveThinkingEnabled = agent.useSpecificModel
        ? (agent.thinkingEnabled ?? false)
        : store.thinkingEnabled;
      const effectiveThinkingBudget = agent.useSpecificModel
        ? (agent.thinkingBudget ?? 0)
        : store.thinkingBudget;

      const endpoint = resolveAgentEndpoint(effectiveModel);
      const promptValue = store.userInput || '';
      const userPrompt = agent.userPrompt
        .replace(/{input}/gi, input)
        .replace(/{prompt}/gi, promptValue);

      store.addLog('running', `Agent ${agent.name} processing with AI...`);

      const output = await streamAgentResponse(nodeId, endpoint, {
        systemPrompt: agent.systemPrompt,
        userPrompt,
        tools: agent.tools.map(t => ({ toolId: t.toolId, config: t.config })),
        model: effectiveModel,
        maxOutputTokens: effectiveResponseLength,
        thinkingEnabled: effectiveThinkingEnabled,
        thinkingBudget: effectiveThinkingBudget,
      });

      store.updateNode(nodeId, { status: 'complete', output: output || 'No output generated' });
      store.addLog('success', `Agent ${agent.name} completed successfully`);
      return output;
    } catch (error) {
      store.updateNode(nodeId, { status: 'error', output: `Error: ${error}` });
      store.addLog('error', `Agent ${agent.name} failed: ${error}`);
      maybeToastPiiBlock(`Agent ${agent.name} blocked`, error);
      return '';
    }
  }

  async function runAgentBeastMode(nodeId: string, agent: AgentNode) {
    const allNodes = store.allNodes;
    const incomingConns = store.workflow.connections.filter(c => c.toNodeId === nodeId);

    if (incomingConns.length === 0) {
      store.addLog('warning', `Beast Mode: No connections found for agent "${agent.name}"`);
      return;
    }

    const connectedNode = allNodes.find(n => n.id === incomingConns[0].fromNodeId);
    if (!connectedNode) {
      store.addLog('error', 'Beast Mode: Connected node not found');
      return;
    }

    let outputPorts: string[] = [];
    if (connectedNode.nodeType === 'function') {
      const fn = connectedNode as FunctionNode;
      const allPorts = fn.outputPorts || ['output'];
      outputPorts = allPorts.filter(p => {
        const v = fn.outputs?.[p];
        return v && String(v).trim().length > 0;
      });
    } else if (connectedNode.output?.trim()) {
      outputPorts = ['output'];
    }

    if (outputPorts.length === 0) {
      store.addLog(
        'warning',
        `Beast Mode: No outputs with content found in "${connectedNode.name}"`,
      );
      return;
    }

    store.addLog(
      'info',
      `Beast Mode: Processing ${outputPorts.length} outputs from "${connectedNode.name}"`,
    );
    store.updateNode(nodeId, { status: 'running', output: '' });

    const results: string[] = [];
    const outputMode = agent.beastMode?.outputMode || 'concatenate';
    const originalConnections = [...store.workflow.connections];

    try {
      for (let i = 0; i < outputPorts.length; i++) {
        const port = outputPorts[i];
        store.addLog('running', `Beast Mode: Iteration ${i + 1}/${outputPorts.length} — port "${port}"`);

        const tempConnections = originalConnections.map(conn =>
          conn.toNodeId === nodeId && conn.fromNodeId === connectedNode.id
            ? { ...conn, fromOutputPort: port }
            : conn,
        );
        if (!originalConnections.some(c => c.toNodeId === nodeId && c.fromNodeId === connectedNode.id)) {
          tempConnections.push({
            id: `temp-beast-${Date.now()}-${i}`,
            fromNodeId: connectedNode.id,
            toNodeId: nodeId,
            fromOutputPort: port,
          } as any);
        }

        store.workflow.connections = tempConnections;
        await new Promise(r => setTimeout(r, 100));
        store.updateNode(nodeId, {
          output: `Beast Mode: Processing ${i + 1}/${outputPorts.length} (${port})...\n\n${results.join('\n\n---\n\n')}`,
        });

        const result = await executeAgentOnce(nodeId, agent, undefined, {
          nodeId: connectedNode.id,
          port,
        });
        if (result) results.push(result);
      }

      const finalOutput = results.join('\n\n---\n\n');
      store.workflow.connections = originalConnections;

      if (outputMode === 'split') {
        const dynamicOutputs: Record<string, string> = {};
        const dynamicPorts: string[] = [];
        results.forEach((r, i) => {
          const p = `output_${i + 1}`;
          dynamicPorts.push(p);
          dynamicOutputs[p] = r;
        });
        store.updateNode(nodeId, {
          status: 'complete',
          output: finalOutput,
          beastModeOutputs: dynamicOutputs,
          beastModeOutputPorts: dynamicPorts,
        } as any);
      } else {
        store.updateNode(nodeId, {
          status: 'complete',
          output: finalOutput,
          beastModeOutputs: undefined,
          beastModeOutputPorts: undefined,
        } as any);
      }

      store.addLog('success', `Beast Mode: Agent "${agent.name}" completed ${outputPorts.length} iterations`);
    } catch (error) {
      store.updateNode(nodeId, { status: 'error', output: `Beast Mode Error: ${error}` });
      store.addLog('error', `Beast Mode: Agent "${agent.name}" failed: ${error}`);
      maybeToastPiiBlock(`Agent ${agent.name} blocked`, error);
      store.workflow.connections = originalConnections;
    }
  }

  async function runSingleAgent(nodeId: string, customInput?: string): Promise<string> {
    const node = store.allNodes.find(n => n.id === nodeId);
    if (!node || node.nodeType !== 'agent') return '';
    const agent = node as AgentNode;

    if (agent.locked) {
      store.addLog('info', `Agent "${agent.name}" is locked, skipping`);
      return '';
    }

    if ((agent as any).beastMode?.enabled) {
      await runAgentBeastMode(nodeId, agent);
      return '';
    }

    return executeAgentOnce(nodeId, agent, customInput);
  }

  async function runSingleFunction(nodeId: string, customInput?: string) {
    const allNodes = store.allNodes;
    const node = allNodes.find(n => n.id === nodeId);
    if (!node || node.nodeType !== 'function') return;
    const functionNode = node as FunctionNode;

    store.addLog('info', `Executing function: ${functionNode.name}`);
    store.updateNode(nodeId, { status: 'running' });

    try {
      const incomingConns = store.workflow.connections.filter(c => c.toNodeId === nodeId);
      const isStage1 = store.workflow.stages[0]?.nodes.some(n => n.id === nodeId);
      const hasMultipleInputs = functionNode.inputPorts && functionNode.inputPorts.length > 1;

      let input = customInput !== undefined ? customInput : store.userInput || '';
      let nodeToExecute: FunctionNode = functionNode;

      if (hasMultipleInputs && incomingConns.length > 0) {
        const inputsMap: Record<string, string> = {};
        for (const conn of incomingConns) {
          const targetPort = conn.toInputPort || 'input_1';
          const fromNode = allNodes.find(n => n.id === conn.fromNodeId);
          if (!fromNode) continue;
          let port = conn.fromOutputPort;
          if (!port && fromNode.nodeType === 'function') {
            const fn = fromNode as FunctionNode;
            port = fn.outputs ? Object.keys(fn.outputs)[0] || 'output' : 'output';
          }
          let value = '';
          if (fromNode.nodeType === 'function' && port) {
            const v = (fromNode as FunctionNode).outputs?.[port];
            value = v !== undefined && v !== null ? String(v) : '';
          } else if (fromNode.nodeType === 'agent' && port) {
            value = (fromNode as AgentNode).beastModeOutputs?.[port] || fromNode.output || '';
          } else {
            value = fromNode.output || '';
          }
          inputsMap[targetPort] = value;
        }
        store.updateNode(nodeId, { inputs: inputsMap } as any);
        nodeToExecute = { ...functionNode, inputs: inputsMap };
      } else if (incomingConns.length > 0 && customInput === undefined) {
        const outs = incomingConns
          .map(c => {
            const fromNode = allNodes.find(n => n.id === c.fromNodeId);
            if (!fromNode) return '';
            let port = c.fromOutputPort;
            if (!port && fromNode.nodeType === 'function') {
              const fn = fromNode as FunctionNode;
              port = fn.outputs ? Object.keys(fn.outputs)[0] || 'output' : 'output';
            }
            if (fromNode.nodeType === 'function' && port) {
              const v = (fromNode as FunctionNode).outputs?.[port];
              return v !== undefined && v !== null ? String(v) : '';
            }
            if (fromNode.nodeType === 'agent' && port) {
              const an = fromNode as AgentNode;
              if (an.beastModeOutputs?.[port]) return an.beastModeOutputs[port];
            }
            return fromNode.output || '';
          })
          .filter(v => v.trim().length > 0);
        input = outs.length > 0 ? outs.join('\n\n---\n\n') : isStage1 ? store.userInput || '' : '';
      } else if (isStage1 && customInput === undefined) {
        input = store.userInput || '';
      }

      const result = await FunctionExecutor.execute(nodeToExecute, input);
      if (!result.success) throw new Error(result.error || 'Function execution failed');

      const firstOutput = Object.values(result.outputs)[0] ?? '';
      store.updateNode(nodeId, {
        status: 'complete',
        output: firstOutput,
        outputs: result.outputs,
      } as any);
      store.addLog('success', `Function ${functionNode.name} completed`);
    } catch (error) {
      store.updateNode(nodeId, { status: 'error', output: `Error: ${error}` });
      store.addLog('error', `Function ${functionNode.name} failed: ${error}`);
      maybeToastPiiBlock(`Function ${functionNode.name} blocked`, error);
    }
  }

  async function runStage(stageId: string) {
    const stage = store.workflow.stages.find(s => s.id === stageId);
    if (!stage) return;

    store.addLog('info', `🎯 Stage "${stage.name}" execution started`);
    stage.nodes.forEach(node => {
      if (!node.locked) store.updateNode(node.id, { status: 'idle', output: undefined });
    });

    for (const node of stage.nodes) {
      if (node.locked) {
        store.addLog('info', `${node.nodeType === 'agent' ? 'Agent' : 'Function'} "${node.name}" is locked, skipping`);
        continue;
      }
      const allNodes = store.allNodes;
      const incomingConns = store.workflow.connections.filter(c => c.toNodeId === node.id);
      let input = store.userInput || '';

      if (incomingConns.length > 0) {
        const outs = incomingConns
          .map(c => {
            const fromNode = allNodes.find(n => n.id === c.fromNodeId);
            if (!fromNode) return '';
            if (c.fromOutputPort && fromNode.nodeType === 'function') {
              const fn = fromNode as FunctionNode;
              const v = fn.outputs?.[c.fromOutputPort];
              if (v !== undefined) return String(v);
              return typeof fn.output === 'object'
                ? ((fn.output as any)[c.fromOutputPort] ?? '')
                : fn.output || '';
            }
            if (c.fromOutputPort && fromNode.nodeType === 'agent') {
              const an = fromNode as AgentNode;
              if (an.beastModeOutputs?.[c.fromOutputPort]) return an.beastModeOutputs[c.fromOutputPort];
            }
            return fromNode.output || '';
          })
          .filter(Boolean);
        if (outs.length > 0) input = outs.join('\n\n');
      }

      if (node.nodeType === 'agent') await runSingleAgent(node.id, input);
      else if (node.nodeType === 'function') await runSingleFunction(node.id, input);
    }

    store.addLog('success', `✓ Stage "${stage.name}" execution completed`);
  }

  async function runWorkflow() {
    const allNodes = store.allNodes;
    store.clearLogs();
    store.addLog('info', '🚀 Workflow execution started');
    allNodes.forEach(node => {
      if (!node.locked) store.updateNode(node.id, { status: 'idle', output: undefined });
    });

    const outputs = new Map<string, string>();

    const executeInWorkflow = async (nodeId: string, input: string): Promise<string> => {
      const node = allNodes.find(n => n.id === nodeId);
      if (!node || node.nodeType !== 'agent') return '';
      const agent = node as AgentNode;

      if (agent.locked) {
        store.addLog('info', `Agent "${agent.name}" is locked, using existing output`);
        return agent.output || '';
      }

      if (!agent.executeOnNullInput && isNullLikeValue(input)) {
        store.addLog('warning', `Agent "${agent.name}" skipped — input is null and "Execute on NULL Input" is disabled`);
        store.updateNode(nodeId, { status: 'idle', output: '' });
        return '';
      }

      store.addLog('info', `Starting agent: ${agent.name} (input: ${input.length} chars)`);
      store.updateNode(nodeId, { status: 'running' });

      const effectiveModel =
        agent.useSpecificModel && agent.model ? agent.model : store.selectedModel;
      const effectiveResponseLength =
        agent.useSpecificModel && agent.responseLength ? agent.responseLength : store.responseLength;
      const effectiveThinkingEnabled = agent.useSpecificModel
        ? (agent.thinkingEnabled ?? false)
        : store.thinkingEnabled;
      const effectiveThinkingBudget = agent.useSpecificModel
        ? (agent.thinkingBudget ?? 0)
        : store.thinkingBudget;

      const endpoint = resolveAgentEndpoint(effectiveModel);
      const promptValue = store.userInput || '';
      const userPrompt = agent.userPrompt
        .replace(/{input}/gi, input)
        .replace(/{prompt}/gi, promptValue);

      store.addLog('running', `Agent ${agent.name} processing with AI...`);

      try {
        const output = await streamAgentResponse(nodeId, endpoint, {
          systemPrompt: agent.systemPrompt,
          userPrompt,
          tools: agent.tools.map(t => ({ toolId: t.toolId, config: t.config })),
          model: effectiveModel,
          maxOutputTokens: effectiveResponseLength,
          thinkingEnabled: effectiveThinkingEnabled,
          thinkingBudget: effectiveThinkingBudget,
        });
        outputs.set(nodeId, output);
        store.updateNode(nodeId, { status: 'complete', output: output || 'No output generated' });
        store.addLog('success', `Agent ${agent.name} completed`);
        return output;
      } catch (err) {
        store.updateNode(nodeId, { status: 'error', output: `Error: ${err}` });
        store.addLog('error', `Agent ${agent.name} failed: ${err}`);
        maybeToastPiiBlock(`Agent ${agent.name} blocked`, err);
        return '';
      }
    };

    for (const stage of store.workflow.stages) {
      for (const node of stage.nodes) {
        if (node.locked) continue;
        const incomingConns = store.workflow.connections.filter(c => c.toNodeId === node.id);
        const isStage1 = store.workflow.stages[0]?.nodes.some(n => n.id === node.id);
        let input = isStage1 ? store.userInput || '' : '';

        if (incomingConns.length > 0) {
          const outs = incomingConns
            .map(c => {
              const fromNode = allNodes.find(n => n.id === c.fromNodeId);
              if (!fromNode) return '';
              let port = c.fromOutputPort;
              if (!port && fromNode.nodeType === 'function') {
                const fn = fromNode as FunctionNode;
                port = fn.outputs ? Object.keys(fn.outputs)[0] || 'output' : 'output';
              }
              if (fromNode.nodeType === 'function' && port) {
                const v = (fromNode as FunctionNode).outputs?.[port];
                return v !== undefined && v !== null ? String(v) : '';
              }
              if (fromNode.nodeType === 'agent' && port) {
                const an = fromNode as AgentNode;
                if (an.beastModeOutputs?.[port]) return an.beastModeOutputs[port];
              }
              return outputs.get(c.fromNodeId) || fromNode.output || '';
            })
            .filter(v => v.trim().length > 0);
          if (outs.length > 0) input = outs.join('\n\n---\n\n');
        }

        if (node.nodeType === 'agent') {
          const result = await executeInWorkflow(node.id, input);
          outputs.set(node.id, result);
        } else if (node.nodeType === 'function') {
          await runSingleFunction(node.id, input);
        }
      }
    }

    store.addLog('success', '✓ Workflow execution completed');
  }

  async function runDownstream(startNodeId: string) {
    const allNodes = store.allNodes;
    const startNode = allNodes.find(n => n.id === startNodeId);
    if (!startNode) {
      store.addLog('error', 'Cannot run downstream: starting node not found');
      return;
    }

    // BFS to collect all downstream node IDs
    const downstreamIds = new Set<string>();
    const queue = [startNodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (!downstreamIds.has(id)) {
        downstreamIds.add(id);
        store.workflow.connections
          .filter(c => c.fromNodeId === id)
          .forEach(c => {
            if (!downstreamIds.has(c.toNodeId)) queue.push(c.toNodeId);
          });
      }
    }

    const downstreamNodes = allNodes.filter(n => downstreamIds.has(n.id));
    store.addLog(
      'info',
      `🚀 Running downstream from "${startNode.name}" (${downstreamNodes.length} node(s))`,
    );

    // Pre-populate outputs map from non-downstream nodes
    const outputs = new Map<string, string>();
    allNodes.forEach(node => {
      if (!downstreamIds.has(node.id)) {
        if (node.nodeType === 'function') {
          const fn = node as FunctionNode;
          if (fn.outputs) {
            Object.entries(fn.outputs).forEach(([p, v]) => outputs.set(`${node.id}:${p}`, String(v)));
          }
          outputs.set(node.id, fn.output || '');
        } else {
          outputs.set(node.id, node.output || '');
        }
      }
    });

    for (const node of downstreamNodes) {
      if (node.locked) continue;
      const incomingConns = store.workflow.connections.filter(c => c.toNodeId === node.id);
      let input = store.userInput || '';

      if (incomingConns.length > 0) {
        const outs = incomingConns
          .map(c => {
            const fromNode = allNodes.find(n => n.id === c.fromNodeId);
            if (!fromNode) return '';
            let port = c.fromOutputPort;
            if (!port && fromNode.nodeType === 'function') {
              const fn = fromNode as FunctionNode;
              port = fn.outputs ? Object.keys(fn.outputs)[0] || 'output' : 'output';
            }
            if (port) {
              const portOutput = outputs.get(`${c.fromNodeId}:${port}`);
              if (portOutput !== undefined) return portOutput;
            }
            return outputs.get(c.fromNodeId) || fromNode.output || '';
          })
          .filter(v => v.trim().length > 0);
        input = outs.length > 0 ? outs.join('\n\n---\n\n') : '';
      }

      if (node.nodeType === 'agent') {
        const result = await runSingleAgent(node.id, input);
        outputs.set(node.id, result);
      } else if (node.nodeType === 'function') {
        await runSingleFunction(node.id, input);
      }
    }
  }

  return {
    executeAgentOnce,
    runAgentBeastMode,
    runSingleAgent,
    runSingleFunction,
    runStage,
    runWorkflow,
    runDownstream,
  };
}
