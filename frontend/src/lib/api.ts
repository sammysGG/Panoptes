'use client';

// Panoptes API client. Talks to the backend (Express + Socket.IO). The JWT issued
// at login is stored in localStorage and attached to every request.

// Resolve the backend base URL. Priority:
//   1. NEXT_PUBLIC_API_URL baked at build time (explicit override)
//   2. The host the UI is served from, on the backend port (default 4000)
//   3. localhost:4000 (SSR / dev fallback)
// Deriving from window.location means the same build works on any deploy host
// without rebuilding — browse to the server's IP and the API follows.
const BACKEND_PORT = process.env.NEXT_PUBLIC_API_PORT || '4000';

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
  }
  return `http://localhost:${BACKEND_PORT}`;
}

export const API_BASE = resolveApiBase();
export const TOKEN_KEY = 'panoptes-token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || res.statusText);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

// ---- Domain types (mirror the backend) -------------------------------------
export interface ScanPort {
  port: number;
  protocol: string;
  state: string;
  service?: string;
  product?: string;
  version?: string;
}
export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  appliesTo: string[];
  params: ModuleParam[];
  channel?: string;
  experimental?: boolean;
}
export interface ModuleParam {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'text' | 'secret';
  required?: boolean;
  default?: string | number | boolean;
  help?: string;
}
export interface SystemSummary {
  id: number;
  ip: string;
  hostname: string | null;
  detectedType: string | null;
  definitionId: string | null;
  osGuess: string | null;
  openPorts: ScanPort[];
  status: string;
  notes: string | null;
  credential: { id: number; username: string; port: number; authType: string } | null;
  availableModules: ModuleManifest[];
}
export interface SystemDefinition {
  id: string;
  name: string;
  description?: string;
  builtin: boolean;
  match: Record<string, unknown>;
  defaultModuleIds: string[];
  channel?: string;
  icon?: string;
}
export interface ScanRecord {
  id: number;
  cidr: string;
  method: string;
  status: string;
  host_count: number;
  hosts?: EnrichedHost[];
}
export interface EnrichedHost {
  ip: string;
  hostname?: string;
  osGuess?: string;
  ports: ScanPort[];
  definitionId: string | null;
  definitionName: string | null;
  score: number;
}
export interface TaskRecord {
  id: number;
  systemId: number;
  moduleId: string;
  moduleName: string | null;
  status: 'pending' | 'running' | 'success' | 'failed';
  exitMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  logs?: { ts: string; stream: string; line: string }[];
}
export interface Stats {
  systemCount: number;
  byType: { type: string; count: number }[];
  tasks: Record<string, number>;
  taskTotal: number;
  lastScan: ScanRecord | null;
  recentTasks: { id: number; module_name: string; status: string; ip: string; finished_at: string }[];
}
