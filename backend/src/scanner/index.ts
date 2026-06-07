import { db } from '../db';
import { ScanHost } from '../types';
import { classifyHost } from './classify';
import { nmapAvailable, runNmap } from './nmap';
import { tcpSweep } from './fallback';

export interface ScanProgress {
  scanId: number;
  status: 'running' | 'done' | 'failed';
  done?: number;
  total?: number;
  message?: string;
}

export interface EnrichedHost extends ScanHost {
  definitionId: string | null;
  definitionName: string | null;
  score: number;
}

export type ProgressEmitter = (p: ScanProgress) => void;

// Run a scan: create a scan row, sweep the target, classify hosts, persist results.
// Prefers nmap when present (richer fingerprinting); otherwise uses the TCP sweep.
export async function startScan(
  cidr: string,
  emit: ProgressEmitter,
  opts: { forceFallback?: boolean } = {}
): Promise<{ scanId: number; hosts: EnrichedHost[] }> {
  const useNmap = !opts.forceFallback && nmapAvailable();
  const method = useNmap ? 'nmap' : 'tcp-sweep';

  const info = db
    .prepare('INSERT INTO scans (cidr, method, status) VALUES (?, ?, ?)')
    .run(cidr, method, 'running');
  const scanId = Number(info.lastInsertRowid);

  emit({ scanId, status: 'running', message: `scanning ${cidr} via ${method}` });

  try {
    let rawHosts: ScanHost[];
    if (useNmap) {
      rawHosts = await runNmap(cidr, {
        onProgress: (line) => emit({ scanId, status: 'running', message: line.trim() }),
      });
    } else {
      rawHosts = await tcpSweep(cidr, {
        onProgress: (done, total) => emit({ scanId, status: 'running', done, total }),
      });
    }

    const hosts: EnrichedHost[] = rawHosts.map((h) => {
      const c = classifyHost(h);
      return { ...h, definitionId: c.definitionId, definitionName: c.definitionName, score: c.score };
    });

    db.prepare(
      "UPDATE scans SET status='done', host_count=?, result_json=?, finished_at=datetime('now') WHERE id=?"
    ).run(hosts.length, JSON.stringify(hosts), scanId);

    emit({ scanId, status: 'done', total: hosts.length, message: `found ${hosts.length} host(s)` });
    return { scanId, hosts };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    db.prepare("UPDATE scans SET status='failed', finished_at=datetime('now') WHERE id=?").run(
      scanId
    );
    emit({ scanId, status: 'failed', message });
    throw e;
  }
}
