import { db } from '../db';
import { ScanHost } from '../types';
import { classifyHost } from './classify';
import { nmapAvailable, runNmap } from './nmap';
import { tcpSweep } from './fallback';

export interface ScanProgress {
  scanId: number;
  status: 'running' | 'done' | 'failed';
  phase?: string; // human-readable phase, e.g. "sweeping", "service detection"
  done?: number; // hosts probed so far (TCP sweep)
  total?: number; // total hosts in range (TCP sweep)
  percent?: number; // 0-100 progress (nmap stats, or computed from done/total)
  found?: number; // hosts discovered so far
  message?: string; // a log line for the live console
  host?: EnrichedHost; // a newly discovered + classified host (streamed live)
}

export interface EnrichedHost extends ScanHost {
  definitionId: string | null;
  definitionName: string | null;
  score: number;
}

export type ProgressEmitter = (p: ScanProgress) => void;

function enrich(h: ScanHost): EnrichedHost {
  const c = classifyHost(h);
  return { ...h, definitionId: c.definitionId, definitionName: c.definitionName, score: c.score };
}

// Create the scan row up front and decide the method, so the API can return a
// scan id immediately and stream progress while the scan runs in the background.
export function beginScan(
  cidr: string,
  opts: { forceFallback?: boolean } = {}
): { scanId: number; method: string; useNmap: boolean } {
  const useNmap = !opts.forceFallback && nmapAvailable();
  const method = useNmap ? 'nmap' : 'tcp-sweep';
  const info = db
    .prepare('INSERT INTO scans (cidr, method, status) VALUES (?, ?, ?)')
    .run(cidr, method, 'running');
  return { scanId: Number(info.lastInsertRowid), method, useNmap };
}

// Run the actual scan, streaming rich progress (percent, found count, per-host
// discoveries, and log lines) and persisting the classified result.
export async function executeScan(
  scanId: number,
  cidr: string,
  useNmap: boolean,
  emit: ProgressEmitter
): Promise<EnrichedHost[]> {
  const method = useNmap ? 'nmap' : 'tcp-sweep';
  emit({ scanId, status: 'running', phase: 'starting', percent: 0, found: 0, message: `Scanning ${cidr} via ${method}…` });

  try {
    let rawHosts: ScanHost[];
    let found = 0;

    if (useNmap) {
      let percent = 0;
      const liveHosts = new Set<string>();
      rawHosts = await runNmap(cidr, {
        args: ['-sS', '-sV', '-O', '--top-ports', '200', '-T4', '-v', '--stats-every', '2s'],
        onProgress: (line) => {
          const text = line.trim();
          if (!text) return;
          const pm = text.match(/([\d.]+)% done/);
          if (pm) percent = parseFloat(pm[1]);
          // Track hosts as nmap reports their open ports, for a live found count.
          const hm = text.match(/Discovered open port \S+ on (\d+\.\d+\.\d+\.\d+)/i);
          if (hm) liveHosts.add(hm[1]);
          found = liveHosts.size;
          emit({ scanId, status: 'running', phase: 'service detection', percent, found, message: text });
        },
      });
    } else {
      rawHosts = await tcpSweep(cidr, {
        onProgress: (done, total) =>
          emit({
            scanId,
            status: 'running',
            phase: 'sweeping',
            done,
            total,
            percent: total ? Math.round((done / total) * 100) : undefined,
            found,
          }),
        onHost: (h) => {
          found += 1;
          const eh = enrich(h);
          emit({
            scanId,
            status: 'running',
            phase: 'sweeping',
            found,
            host: eh,
            message: `Found ${h.ip} — ${h.ports.length} open port(s) → ${eh.definitionName || 'Unclassified'}`,
          });
        },
      });
    }

    const hosts = rawHosts.map(enrich);
    db.prepare(
      "UPDATE scans SET status='done', host_count=?, result_json=?, finished_at=datetime('now') WHERE id=?"
    ).run(hosts.length, JSON.stringify(hosts), scanId);

    emit({
      scanId,
      status: 'done',
      phase: 'done',
      percent: 100,
      found: hosts.length,
      message: `Scan complete — ${hosts.length} host(s) found.`,
    });
    return hosts;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    db.prepare("UPDATE scans SET status='failed', finished_at=datetime('now') WHERE id=?").run(scanId);
    emit({ scanId, status: 'failed', phase: 'failed', message: `Scan failed: ${message}` });
    throw e;
  }
}

// Convenience wrapper (create + run) retained for tests / programmatic use.
export async function startScan(
  cidr: string,
  emit: ProgressEmitter,
  opts: { forceFallback?: boolean } = {}
): Promise<{ scanId: number; hosts: EnrichedHost[] }> {
  const { scanId, useNmap } = beginScan(cidr, opts);
  const hosts = await executeScan(scanId, cidr, useNmap, emit);
  return { scanId, hosts };
}
