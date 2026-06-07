import { Router } from 'express';
import { db } from '../db';
import { getCredentialSummary, saveCredential } from '../credentials';
import { modulesForDefinition } from '../modules/loader';

export const systemsRouter = Router();

interface SystemRow {
  id: number;
  ip: string;
  hostname: string | null;
  detected_type: string | null;
  definition_id: string | null;
  os_guess: string | null;
  open_ports: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

function hydrate(row: SystemRow) {
  return {
    id: row.id,
    ip: row.ip,
    hostname: row.hostname,
    detectedType: row.detected_type,
    definitionId: row.definition_id,
    osGuess: row.os_guess,
    openPorts: row.open_ports ? JSON.parse(row.open_ports) : [],
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    credential: getCredentialSummary(row.id),
    availableModules: modulesForDefinition(row.definition_id),
  };
}

systemsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM systems ORDER BY definition_id, ip').all() as SystemRow[];
  res.json(rows.map(hydrate));
});

systemsRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM systems WHERE id = ?').get(req.params.id) as
    | SystemRow
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'system not found' });
    return;
  }
  res.json(hydrate(row));
});

// Manually add a system (e.g. a host that was not found by the scan).
systemsRouter.post('/', (req, res) => {
  const { ip, hostname, definitionId, detectedType } = req.body || {};
  if (!ip) {
    res.status(400).json({ error: 'ip is required' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO systems (ip, hostname, definition_id, detected_type, open_ports)
       VALUES (?, ?, ?, ?, '[]')
       ON CONFLICT(ip) DO UPDATE SET hostname=excluded.hostname,
         definition_id=excluded.definition_id, detected_type=excluded.detected_type`
    )
    .run(ip, hostname ?? null, definitionId ?? null, detectedType ?? null);
  const row = db
    .prepare('SELECT * FROM systems WHERE id = ?')
    .get(info.lastInsertRowid || (db.prepare('SELECT id FROM systems WHERE ip=?').get(ip) as any)?.id) as SystemRow;
  res.json(hydrate(row));
});

systemsRouter.patch('/:id', (req, res) => {
  const { definitionId, detectedType, notes, status, hostname } = req.body || {};
  db.prepare(
    `UPDATE systems SET
       definition_id = COALESCE(?, definition_id),
       detected_type = COALESCE(?, detected_type),
       hostname = COALESCE(?, hostname),
       notes = COALESCE(?, notes),
       status = COALESCE(?, status)
     WHERE id = ?`
  ).run(definitionId ?? null, detectedType ?? null, hostname ?? null, notes ?? null, status ?? null, req.params.id);
  const row = db.prepare('SELECT * FROM systems WHERE id = ?').get(req.params.id) as SystemRow;
  res.json(hydrate(row));
});

systemsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM systems WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Save (replace) the SSH credential for a system. The secret is encrypted at rest
// and never returned by any read endpoint.
systemsRouter.put('/:id/credential', (req, res) => {
  const systemId = parseInt(req.params.id, 10);
  const { username, port, authType, secret, passphrase } = req.body || {};
  if (!username || !authType || !secret) {
    res.status(400).json({ error: 'username, authType and secret are required' });
    return;
  }
  if (authType !== 'password' && authType !== 'key') {
    res.status(400).json({ error: "authType must be 'password' or 'key'" });
    return;
  }
  saveCredential({ systemId, username, port, authType, secret, passphrase });
  res.json({ ok: true, credential: getCredentialSummary(systemId) });
});
