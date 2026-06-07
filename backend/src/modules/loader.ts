import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { config } from '../config';
import { ModuleManifest, ModuleRun } from '../types';

export interface LoadedModule {
  manifest: ModuleManifest;
  run: ModuleRun;
  dir: string;
}

const registry = new Map<string, LoadedModule>();

function loadOne(dir: string): LoadedModule | null {
  const manifestPath = path.join(dir, 'module.json');
  const runPath = path.join(dir, 'run.js');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(runPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ModuleManifest;
    // Bust the require cache so re-imported/edited modules pick up changes.
    delete require.cache[require.resolve(runPath)];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(runPath);
    const run: ModuleRun = mod.run || mod.default || mod;
    if (typeof run !== 'function') throw new Error('run.js must export a function');
    if (!manifest.id) throw new Error('module.json missing id');
    return { manifest, run, dir };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[modules] failed to load ${dir}: ${(e as Error).message}`);
    return null;
  }
}

export function loadAllModules(): void {
  registry.clear();
  if (!fs.existsSync(config.modulesDir)) {
    fs.mkdirSync(config.modulesDir, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(config.modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const loaded = loadOne(path.join(config.modulesDir, entry.name));
    if (loaded) registry.set(loaded.manifest.id, loaded);
  }
  // eslint-disable-next-line no-console
  console.log(`[modules] loaded ${registry.size} module(s)`);
}

// Watch the modules directory so dropped-in / uploaded modules are hot-loaded.
export function watchModules(): void {
  chokidar
    .watch(config.modulesDir, { ignoreInitial: true, depth: 2 })
    .on('all', () => loadAllModules());
}

export function listModules(): ModuleManifest[] {
  return Array.from(registry.values()).map((m) => m.manifest);
}

export function getModule(id: string): LoadedModule | undefined {
  return registry.get(id);
}

// Modules applicable to a given system-definition id (or universal '*' modules).
export function modulesForDefinition(defId: string | null): ModuleManifest[] {
  return listModules().filter(
    (m) => m.appliesTo.includes('*') || (defId !== null && m.appliesTo.includes(defId))
  );
}
