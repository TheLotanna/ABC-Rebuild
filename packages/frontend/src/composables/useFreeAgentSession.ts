// Thin composable wrapper — delegates all logic to the Pinia store.
// Keeping the same call-site signature as the original React hook so
// consuming components need minimal changes.
import { useFreeAgentStore } from '@/stores/freeAgentStore';

export interface UseFreeAgentSessionOptions {
  maxIterations?: number;
}

export function useFreeAgentSession(_options: UseFreeAgentSessionOptions = {}) {
  return useFreeAgentStore();
}
