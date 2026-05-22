import {
  AlignLeft,
  CheckCircle,
  Circle,
  Database,
  ExternalLink,
  FileDown,
  FileJson,
  FileText,
  Filter,
  GitBranch,
  Github,
  Globe,
  Image,
  Mail,
  Merge,
  Send,
  Split,
  Type,
  Volume,
  Zap,
  type LucideIcon,
} from 'lucide-vue-next';

const registry: Record<string, LucideIcon> = {
  AlignLeft,
  CheckCircle,
  Circle,
  Database,
  ExternalLink,
  FileDown,
  FileJson,
  FileText,
  Filter,
  GitBranch,
  Github,
  Globe,
  Image,
  Mail,
  Merge,
  Send,
  Split,
  Type,
  Volume,
  Zap,
};

export function iconFor(name: string | undefined): LucideIcon {
  if (!name) return Circle;
  return registry[name] ?? Circle;
}
