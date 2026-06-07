import fs from 'fs';
import path from 'path';
import { db } from './db';
import { config } from './config';
import { SystemDefinition } from './types';

interface DefRow {
  id: string;
  name: string;
  description: string | null;
  builtin: number;
  match_json: string;
  default_module_ids: string;
  channel: string | null;
  icon: string | null;
}

function rowToDef(r: DefRow): SystemDefinition {
  return {
    id: r.id,
    name: r.name,
    description: r.description || undefined,
    builtin: !!r.builtin,
    match: JSON.parse(r.match_json),
    defaultModuleIds: JSON.parse(r.default_module_ids),
    channel: (r.channel as 'ssh' | 'winrm') || 'ssh',
    icon: r.icon || undefined,
  };
}

// Load seed definition JSON files into the DB on first run. Existing builtin rows
// are refreshed so shipped match rules stay current; user-created defs are left alone.
export function seedDefinitions(): void {
  if (!fs.existsSync(config.definitionsDir)) return;
  const files = fs.readdirSync(config.definitionsDir).filter((f) => f.endsWith('.json'));
  const upsert = db.prepare(`
    INSERT INTO system_definitions (id, name, description, builtin, match_json, default_module_ids, channel, icon)
    VALUES (@id, @name, @description, 1, @match_json, @default_module_ids, @channel, @icon)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, description=excluded.description, match_json=excluded.match_json,
      default_module_ids=excluded.default_module_ids, channel=excluded.channel, icon=excluded.icon
    WHERE system_definitions.builtin = 1
  `);
  for (const file of files) {
    const def = JSON.parse(
      fs.readFileSync(path.join(config.definitionsDir, file), 'utf8')
    ) as SystemDefinition;
    upsert.run({
      id: def.id,
      name: def.name,
      description: def.description ?? null,
      match_json: JSON.stringify(def.match),
      default_module_ids: JSON.stringify(def.defaultModuleIds || []),
      channel: def.channel || 'ssh',
      icon: def.icon ?? null,
    });
  }
}

export function listDefinitions(): SystemDefinition[] {
  return (db.prepare('SELECT * FROM system_definitions ORDER BY name').all() as DefRow[]).map(
    rowToDef
  );
}

export function getDefinition(id: string): SystemDefinition | null {
  const row = db.prepare('SELECT * FROM system_definitions WHERE id = ?').get(id) as
    | DefRow
    | undefined;
  return row ? rowToDef(row) : null;
}

export function upsertDefinition(def: SystemDefinition): void {
  db.prepare(
    `INSERT INTO system_definitions (id, name, description, builtin, match_json, default_module_ids, channel, icon)
     VALUES (@id, @name, @description, @builtin, @match_json, @default_module_ids, @channel, @icon)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, description=excluded.description, match_json=excluded.match_json,
       default_module_ids=excluded.default_module_ids, channel=excluded.channel, icon=excluded.icon`
  ).run({
    id: def.id,
    name: def.name,
    description: def.description ?? null,
    builtin: def.builtin ? 1 : 0,
    match_json: JSON.stringify(def.match),
    default_module_ids: JSON.stringify(def.defaultModuleIds || []),
    channel: def.channel || 'ssh',
    icon: def.icon ?? null,
  });
}

export function deleteDefinition(id: string): void {
  db.prepare('DELETE FROM system_definitions WHERE id = ? AND builtin = 0').run(id);
}
