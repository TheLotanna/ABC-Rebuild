// Tool Fallback System for Free Agent
// Provides alternative tools when primary tools fail

export const TOOL_FALLBACKS: Record<string, string[]> = {
  // Search tools
  'brave_search': ['google_search'],
  'google_search': ['brave_search'],

  // GitHub tools (can fallback to web scraping)
  'read_github_repo': ['web_scrape'],
  'read_github_file': ['web_scrape'],

  // Weather tools (if multiple providers exist)
  'get_weather': [],

  // Email tools (future: could have multiple providers)
  'send_email': [],

  // Image generation tools (future: multiple models)
  'image_generation': [],

  // TTS tools
  'elevenlabs_tts': [],

  // API tools
  'get_call_api': [],
  'post_call_api': [],

  // Database tools
  'execute_sql': [],
  'read_database_schemas': [],

  // Document tools
  'web_scrape': [],
  'pdf_info': [],
  'pdf_extract_text': [],
  'ocr_image': [],

  // ZIP tools
  'read_zip_contents': [],
  'read_zip_file': [],
  'extract_zip_files': [],

  // Memory tools (no fallbacks - these are critical)
  'read_blackboard': [],
  'write_blackboard': [],
  'read_scratchpad': [],
  'write_scratchpad': [],
  'read_attribute': [],
  'read_artifact': [],
  'read_file': [],
  'read_prompt': [],
  'read_prompt_files': [],

  // Export tools
  'export_word': [],
  'export_pdf': [],
  'pronghorn_post': [],

  // Interaction tools
  'request_assistance': [],

  // Advanced tools
  'read_self': [],
  'write_self': [],
  'spawn': [],

  // Utility tools
  'get_time': [],
};

/**
 * Get fallback tools for a given tool
 */
export function getFallbackTools(toolName: string): string[] {
  return TOOL_FALLBACKS[toolName] || [];
}

/**
 * Check if a tool has fallback options
 */
export function hasFallbackTools(toolName: string): boolean {
  const fallbacks = TOOL_FALLBACKS[toolName];
  return fallbacks !== undefined && fallbacks.length > 0;
}

/**
 * Check if an error is retryable (transient failures)
 */
export function isRetryableError(error: string, statusCode?: number): boolean {
  if (!error) return false;

  // HTTP status codes that are retryable
  if (statusCode) {
    // 429 Rate limit
    if (statusCode === 429) return true;
    // 5xx Server errors
    if (statusCode >= 500 && statusCode < 600) return true;
    // 408 Request timeout
    if (statusCode === 408) return true;
  }

  // Error message patterns that indicate transient issues
  const retryablePatterns = [
    /rate limit/i,
    /timeout/i,
    /temporary/i,
    /try again/i,
    /server error/i,
    /503/,
    /502/,
    /504/,
    /connection/i,
    /network/i,
  ];

  return retryablePatterns.some(pattern => pattern.test(error));
}

/**
 * Calculate exponential backoff delay
 */
export function getBackoffDelay(attempt: number, baseDelay: number = 2000): number {
  // Exponential: 2s, 4s, 8s
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Sleep for a given duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
