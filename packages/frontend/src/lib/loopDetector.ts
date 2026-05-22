// Enhanced Loop Detection System for Free Agent
// Detects when the agent is stuck in repetitive behavior across multiple dimensions

import type { BlackboardEntry, ToolCall } from "@agent-builder/shared";

export type LoopDetectionLevel = "none" | "warning" | "suggest" | "force_break";

export interface LoopDetectionResult {
  level: LoopDetectionLevel;
  detected: boolean;
  message?: string;
  detectedPattern?: string;
  suggestion?: string;
  forcedAction?: string;
  availableData?: string[];
  indicators?: string[];
}

export interface LoopDetectorConfig {
  blackboardWindow?: number; // How many entries to check (default: 3)
  toolCallWindow?: number; // How many tool calls to check (default: 3)
  similarityThreshold?: number; // Jaccard similarity threshold (default: 0.7)
  enableSemanticSimilarity?: boolean; // Enable expensive semantic check (default: false)
}

const DEFAULT_CONFIG: Required<LoopDetectorConfig> = {
  blackboardWindow: 3,
  toolCallWindow: 3,
  similarityThreshold: 0.7,
  enableSemanticSimilarity: false,
};

// ============================================================================
// LEVEL 1: Exact Blackboard Repetition
// ============================================================================

/**
 * Check if the last N blackboard entries are nearly identical (normalized)
 */
function detectBlackboardRepetition(
  blackboard: BlackboardEntry[],
  window: number
): { detected: boolean; pattern?: string } {
  if (blackboard.length < 2) return { detected: false };

  const recent = blackboard.slice(-window);
  if (recent.length < 2) return { detected: false };

  // Normalize entries (lowercase, trim, remove iteration numbers)
  const normalized = recent.map((e) =>
    e.content
      .toLowerCase()
      .trim()
      .replace(/iteration\s*#?\d+/gi, "")
      .replace(/step\s*#?\d+/gi, "")
      .replace(/\d+/g, "")
  );

  // Check if 2+ entries are identical
  const uniqueSet = new Set(normalized);
  if (uniqueSet.size <= Math.ceil(window / 2)) {
    return {
      detected: true,
      pattern: `Last ${window} blackboard entries are nearly identical`,
    };
  }

  return { detected: false };
}

// ============================================================================
// LEVEL 2: Tool Call Pattern Detection
// ============================================================================

interface ToolCallSignature {
  tool: string;
  paramsHash: string;
}

/**
 * Hash tool call parameters for comparison
 */
function hashToolCall(call: ToolCall): string {
  const { tool, params } = call;
  // Create stable hash of params (sorted keys)
  const sortedParams = JSON.stringify(params, Object.keys(params).sort());
  return `${tool}:${sortedParams}`;
}

/**
 * Detect if the same tool+params combination is called 3+ times in window
 */
function detectToolCallLoop(
  toolCalls: ToolCall[],
  window: number
): { detected: boolean; pattern?: string; tool?: string } {
  if (toolCalls.length < 3) return { detected: false };

  const recent = toolCalls.slice(-window);
  if (recent.length < 3) return { detected: false };

  // Count occurrences of each signature
  const signatureCounts = new Map<string, { count: number; tool: string }>();

  for (const call of recent) {
    const sig = hashToolCall(call);
    const existing = signatureCounts.get(sig) || { count: 0, tool: call.tool };
    signatureCounts.set(sig, { count: existing.count + 1, tool: call.tool });
  }

  // Check if any signature appears 3+ times
  for (const [sig, { count, tool }] of signatureCounts) {
    if (count >= 3) {
      return {
        detected: true,
        pattern: `Tool '${tool}' called ${count} times with same parameters`,
        tool,
      };
    }
  }

  return { detected: false };
}

// ============================================================================
// LEVEL 3: Semantic Similarity (Jaccard)
// ============================================================================

/**
 * Calculate Jaccard similarity between two strings (word-level)
 */
function jaccardSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(Boolean));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(Boolean));

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Check if recent blackboard entries are semantically similar
 */
function detectSemanticSimilarity(
  blackboard: BlackboardEntry[],
  window: number,
  threshold: number
): { detected: boolean; pattern?: string } {
  if (blackboard.length < 2) return { detected: false };

  const recent = blackboard.slice(-window);
  if (recent.length < 2) return { detected: false };

  // Compare each pair
  for (let i = 0; i < recent.length - 1; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const similarity = jaccardSimilarity(recent[i].content, recent[j].content);
      if (similarity > threshold) {
        return {
          detected: true,
          pattern: `Blackboard entries #${i + 1} and #${j + 1} are ${(similarity * 100).toFixed(0)}% similar`,
        };
      }
    }
  }

  return { detected: false };
}

// ============================================================================
// LEVEL 4: Stuck State Detection
// ============================================================================

interface StuckStateIndicators {
  sameToolRepeated: boolean;
  highBlackboardSimilarity: boolean;
  noNewArtifacts: boolean;
  noScratchpadGrowth: boolean;
}

/**
 * Detect if the agent is in a stuck state (multiple indicators)
 */
function detectStuckState(
  blackboard: BlackboardEntry[],
  toolCalls: ToolCall[],
  artifactsCount: number,
  scratchpadLength: number,
  previousScratchpadLength: number,
  previousArtifactsCount: number
): { detected: boolean; indicators: string[] } {
  const indicators: string[] = [];

  // Indicator 1: Same tool called 3+ times
  const toolLoop = detectToolCallLoop(toolCalls, 5);
  if (toolLoop.detected) {
    indicators.push(`Same tool '${toolLoop.tool}' called repeatedly`);
  }

  // Indicator 2: High blackboard similarity
  const bbRepetition = detectBlackboardRepetition(blackboard, 3);
  if (bbRepetition.detected) {
    indicators.push("Blackboard entries are repetitive");
  }

  // Indicator 3: No new artifacts in last 5 iterations
  if (artifactsCount === previousArtifactsCount && artifactsCount > 0) {
    indicators.push("No new artifacts created recently");
  }

  // Indicator 4: Scratchpad not growing (no new analysis)
  if (scratchpadLength === previousScratchpadLength && scratchpadLength > 100) {
    indicators.push("Scratchpad unchanged (no new findings)");
  }

  // Stuck if 2+ indicators
  const detected = indicators.length >= 2;

  return { detected, indicators };
}

// ============================================================================
// MAIN LOOP DETECTOR
// ============================================================================

export interface LoopDetectorState {
  recentToolCalls: ToolCall[];
  recentBlackboard: BlackboardEntry[];
  artifactsCount: number;
  scratchpadLength: number;
  previousArtifactsCount: number;
  previousScratchpadLength: number;
  iteration: number;
}

/**
 * Main loop detection function - checks all levels and returns intervention
 */
export function detectLoop(
  state: LoopDetectorState,
  config: LoopDetectorConfig = {},
  availableAttributes: string[] = []
): LoopDetectionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Level 1: Exact Blackboard Repetition
  const bbRepetition = detectBlackboardRepetition(
    state.recentBlackboard,
    cfg.blackboardWindow
  );
  if (bbRepetition.detected) {
    return {
      level: "force_break",
      detected: true,
      message: `⚠️ LOOP DETECTED (Iteration ${state.iteration}) - ${bbRepetition.pattern}`,
      detectedPattern: "Repetitive blackboard entries",
      suggestion: availableAttributes.length > 0
        ? `Check read_attribute([${availableAttributes.map(a => `"${a}"`).join(", ")}]) for existing data before making new tool calls`
        : "Review scratchpad for existing findings before proceeding",
      forcedAction: availableAttributes.length > 0
        ? `You MUST call read_attribute([${availableAttributes.map(a => `"${a}"`).join(", ")}]) to check existing data`
        : "You MUST review your scratchpad and blackboard to understand what's already been done",
      availableData: availableAttributes,
    };
  }

  // Level 2: Tool Call Pattern Detection
  const toolLoop = detectToolCallLoop(state.recentToolCalls, cfg.toolCallWindow);
  if (toolLoop.detected) {
    return {
      level: "force_break",
      detected: true,
      message: `⚠️ LOOP DETECTED (Iteration ${state.iteration}) - ${toolLoop.pattern}`,
      detectedPattern: "Same tool with same parameters",
      suggestion: availableAttributes.length > 0 && toolLoop.tool
        ? `Check if '${toolLoop.tool}' already saved results to attributes`
        : "The tool already succeeded - extract and save the data",
      forcedAction: availableAttributes.length > 0
        ? `You MUST call read_attribute([]) to list available attributes before calling ${toolLoop.tool} again`
        : "You MUST check PREVIOUS ITERATION RESULTS - the data is already there",
      availableData: availableAttributes,
    };
  }

  // Level 3: Semantic Similarity (optional - expensive)
  if (cfg.enableSemanticSimilarity) {
    const semanticSim = detectSemanticSimilarity(
      state.recentBlackboard,
      cfg.blackboardWindow,
      cfg.similarityThreshold
    );
    if (semanticSim.detected) {
      return {
        level: "suggest",
        detected: true,
        message: `⚠️ POTENTIAL LOOP (Iteration ${state.iteration}) - ${semanticSim.pattern}`,
        detectedPattern: "Semantically similar actions",
        suggestion: "You may be repeating similar work. Review what's already been done.",
      };
    }
  }

  // Level 4: Stuck State Detection
  const stuckState = detectStuckState(
    state.recentBlackboard,
    state.recentToolCalls,
    state.artifactsCount,
    state.scratchpadLength,
    state.previousScratchpadLength,
    state.previousArtifactsCount
  );
  if (stuckState.detected) {
    return {
      level: "suggest",
      detected: true,
      message: `⚠️ STUCK STATE DETECTED (Iteration ${state.iteration})`,
      detectedPattern: "Multiple stuck indicators",
      indicators: stuckState.indicators,
      suggestion: "Progress has stalled. Try a different approach or request assistance.",
    };
  }

  // No loop detected
  return { level: "none", detected: false };
}

/**
 * Format loop detection result as a tool result for injection into previousToolResults
 */
export function formatLoopDetectionResult(result: LoopDetectionResult): {
  tool: string;
  success: boolean;
  result: Record<string, unknown>;
} {
  return {
    tool: "_system_loop_intervention",
    success: true,
    result: {
      level: result.level,
      message: result.message,
      detectedPattern: result.detectedPattern,
      suggestion: result.suggestion,
      forcedAction: result.forcedAction,
      availableData: result.availableData,
      indicators: result.indicators,
    },
  };
}
