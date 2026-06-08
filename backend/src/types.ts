// Shared backend types for Panoptes.

export type AuthType = 'password' | 'key';
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';
export type LogStream = 'stdout' | 'stderr' | 'info';

export interface SystemDefinition {
  id: string;
  name: string;
  description?: string;
  builtin: boolean;
  // Match rules used to classify a scanned host into this definition.
  match: MatchRules;
  // Default module ids suggested for systems of this type.
  defaultModuleIds: string[];
  // Default remoting channel hint for the UI.
  channel?: 'ssh' | 'winrm';
  icon?: string;
}

export interface MatchRules {
  // Host is a candidate if it exposes ANY of these ports (broad gate).
  anyPorts?: number[];
  // Host must expose ALL of these ports.
  allPorts?: number[];
  // OS fingerprint substring match (case-insensitive), e.g. "windows", "linux".
  osIncludes?: string[];
  // Service banner / product substring match, e.g. "pfsense", "openssh".
  bannerIncludes?: string[];
  // When true, the definition only matches if at least one osIncludes or
  // bannerIncludes term is found. Open ports alone are NOT enough. Use this for
  // specialised types (e.g. pfSense) so generic web/SSH hosts don't match them.
  requireSignal?: boolean;
  // Higher weight wins when multiple definitions match.
  weight?: number;
}

export interface ScanHost {
  ip: string;
  hostname?: string;
  osGuess?: string;
  ports: ScanPort[];
}

export interface ScanPort {
  port: number;
  protocol: string;
  state: string;
  service?: string;
  product?: string;
  version?: string;
}

export interface ModuleParam {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'text' | 'secret';
  required?: boolean;
  default?: string | number | boolean;
  secret?: boolean;
  help?: string;
}

export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  appliesTo: string[]; // system definition ids, or ['*'] for all
  params: ModuleParam[];
  channel?: 'ssh' | 'winrm';
  experimental?: boolean;
}

// The execution context passed to a module's run() function.
export interface ModuleContext {
  ssh: SshHandle;
  params: Record<string, unknown>;
  system: { id: number; ip: string; hostname?: string; detectedType?: string };
  log: (line: string, stream?: LogStream) => void;
}

export interface SshHandle {
  // Run a command, resolving with the full result. Streams lines to log() as they arrive.
  exec: (command: string) => Promise<{ code: number; stdout: string; stderr: string }>;
  // Upload a small file/string to a remote path.
  putFile: (remotePath: string, content: string, mode?: number) => Promise<void>;
}

export type ModuleRun = (ctx: ModuleContext) => Promise<void>;
