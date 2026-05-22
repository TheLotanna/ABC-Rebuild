// viewerInjectionKeys.ts — provide/inject contract for canvas-internal nodes
// to surface their viewer payloads up to FreeAgentView, since vue-flow's custom
// node renderer doesn't bubble component emits past its component boundary.
//
// Each key is typed via InjectionKey<(payload) => void>; FreeAgentView calls
// `provide()` with the open-modal callbacks; AttributeNode and ScratchpadNode
// call `inject()` to fire them. If the inject returns undefined (e.g. when a
// node is mounted outside the canvas), callers fall back to the existing
// `emit('open-viewer', …)` path.

import type { InjectionKey } from 'vue';

export interface AttributeViewerPayload {
  attributeName: string;
  attributeValue: string;
  attributeTool?: string;
  isBinary?: boolean;
  mimeType?: string;
}

export interface ScratchpadViewerPayload {
  content: string;
  label?: string;
}

export const OpenAttributeViewerKey: InjectionKey<(payload: AttributeViewerPayload) => void> =
  Symbol('OpenAttributeViewer');

export const OpenScratchpadViewerKey: InjectionKey<(payload: ScratchpadViewerPayload) => void> =
  Symbol('OpenScratchpadViewer');
