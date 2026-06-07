import net from 'net';
import { ScanHost, ScanPort } from '../types';
import { expandTargets } from './cidr';

// Pure-Node TCP-connect sweep used when nmap is unavailable. No raw sockets needed.
// Probes a focused set of service ports relevant to Panoptes's system definitions.
export const DEFAULT_PORTS = [
  21, 22, 23, 25, 53, 80, 88, 110, 135, 139, 143, 389, 443, 445, 465, 587, 636, 993,
  995, 1433, 3306, 3389, 5432, 5985, 5986, 8080, 8443,
];

const SERVICE_NAMES: Record<number, string> = {
  21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'http', 88: 'kerberos',
  110: 'pop3', 135: 'msrpc', 139: 'netbios-ssn', 143: 'imap', 389: 'ldap', 443: 'https',
  445: 'microsoft-ds', 465: 'smtps', 587: 'submission', 636: 'ldaps', 993: 'imaps',
  995: 'pop3s', 1433: 'ms-sql-s', 3306: 'mysql', 3389: 'ms-wbt-server', 5432: 'postgresql',
  5985: 'wsman', 5986: 'wsmans', 8080: 'http-proxy', 8443: 'https-alt',
};

function probePort(ip: string, port: number, timeout: number): Promise<ScanPort | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(
        open
          ? { port, protocol: 'tcp', state: 'open', service: SERVICE_NAMES[port] }
          : null
      );
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, ip);
  });
}

async function scanHost(ip: string, ports: number[], timeout: number): Promise<ScanHost | null> {
  const results = await Promise.all(ports.map((p) => probePort(ip, p, timeout)));
  const open = results.filter((r): r is ScanPort => r !== null);
  if (open.length === 0) return null;
  return { ip, ports: open };
}

export interface SweepOptions {
  ports?: number[];
  timeoutMs?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function tcpSweep(target: string, opts: SweepOptions = {}): Promise<ScanHost[]> {
  const ports = opts.ports?.length ? opts.ports : DEFAULT_PORTS;
  const timeout = opts.timeoutMs ?? 700;
  const concurrency = opts.concurrency ?? 64;
  const hosts = expandTargets(target);
  const found: ScanHost[] = [];
  let index = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (index < hosts.length) {
      const ip = hosts[index++];
      const result = await scanHost(ip, ports, timeout);
      if (result) found.push(result);
      completed++;
      opts.onProgress?.(completed, hosts.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, hosts.length) }, () => worker());
  await Promise.all(workers);
  found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return found;
}
