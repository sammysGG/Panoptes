import { Router } from 'express';
import { db } from '../db';
import { beginScan, executeScan, EnrichedHost } from '../scanner';
import { getDefinition } from '../definitions';
import { emitScan } from '../events';

export const scansRouter = Router();

// Kick off a scan. Returns immediately with the scan id; progress streams over
// Socket.IO (room "scan:<id>") and the final result is fetched via GET below.
scansRouter.post('/', (req, res) => {
  const { cidr, forceFallback } = req.body || {};
  if (!cidr || typeof cidr !== 'string') {
    res.status(400).json({ error: 'cidr is required (e.g. 10.0.0.0/24)' });
    return;
  }
  try {
    const { scanId, method } = beginScan(cidr, { forceFallback: !!forceFallback });
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId);
    // Run the scan in the background and stream progress over Socket.IO. The
    // client subscribes to room "scan:<id>" and renders live updates.
    const { useNmap } = { useNmap: method === 'nmap' };
    void executeScan(scanId, cidr, useNmap, emitScan).catch(() => {
      /* failure already persisted + emitted inside executeScan */
    });
    res.json(scan);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

scansRouter.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT id, cidr, method, status, host_count, started_at, finished_at FROM scans ORDER BY id DESC LIMIT 50')
    .all();
  res.json(rows);
});

scansRouter.get('/:id', (req, res) => {
  const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id) as any;
  if (!scan) {
    res.status(404).json({ error: 'scan not found' });
    return;
  }
  scan.hosts = scan.result_json ? JSON.parse(scan.result_json) : [];
  delete scan.result_json;
  res.json(scan);
});

// Import selected (or all) discovered hosts from a scan into the systems board.
scansRouter.post('/:id/import', (req, res) => {
  const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id) as any;
  if (!scan) {
    res.status(404).json({ error: 'scan not found' });
    return;
  }
  const hosts: EnrichedHost[] = scan.result_json ? JSON.parse(scan.result_json) : [];
  const wantedIps: string[] | undefined = req.body?.ips;
  const selected = wantedIps?.length ? hosts.filter((h) => wantedIps.includes(h.ip)) : hosts;

  const upsert = db.prepare(`
    INSERT INTO systems (scan_id, ip, hostname, detected_type, definition_id, os_guess, open_ports)
    VALUES (@scan_id, @ip, @hostname, @detected_type, @definition_id, @os_guess, @open_ports)
    ON CONFLICT(ip) DO UPDATE SET
      scan_id=excluded.scan_id, hostname=excluded.hostname, detected_type=excluded.detected_type,
      definition_id=excluded.definition_id, os_guess=excluded.os_guess, open_ports=excluded.open_ports
  `);
  const tx = db.transaction((items: EnrichedHost[]) => {
    for (const h of items) {
      const def = h.definitionId ? getDefinition(h.definitionId) : null;
      upsert.run({
        scan_id: scan.id,
        ip: h.ip,
        hostname: h.hostname ?? null,
        detected_type: def?.name ?? h.definitionName ?? null,
        definition_id: h.definitionId ?? null,
        os_guess: h.osGuess ?? null,
        open_ports: JSON.stringify(h.ports || []),
      });
    }
  });
  tx(selected);
  res.json({ imported: selected.length });
});
