import type { Component } from 'vue';
import {
  AlignLeft,
  CheckCircle,
  CheckCircle2,
  Circle,
  Database,
  ExternalLink,
  FileDown,
  FileJson,
  FileText,
  Filter,
  GitBranch,
  Globe,
  Image,
  Link2,
  Mail,
  Merge,
  Send,
  Split,
  Type,
  Volume,
  Volume2,
  Zap,
} from '@lucide/vue';

// `@lucide/vue` (the post-deprecation package replacing `lucide-vue-next`)
// doesn't export a `LucideIcon` named type. The new package's icons are
// plain Vue functional components, so a generic `Component` type from Vue
// captures the registry value shape correctly.
type IconComponent = Component;

const registry: Record<string, IconComponent> = {
  AlignLeft,
  CheckCircle,
  CheckCircle2,
  Circle,
  Database,
  ExternalLink,
  FileDown,
  FileJson,
  FileText,
  Filter,
  GitBranch,
  Globe,
  Image,
  Link2,
  Mail,
  Merge,
  Send,
  Split,
  Type,
  Volume,
  Volume2,
  Zap,
};

export function iconFor(name: string | undefined): IconComponent {
  if (!name) return Circle;
  return registry[name] ?? Circle;
}
