import { spawn, spawnSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { ScanHost, ScanPort } from '../types';

export function nmapAvailable(): boolean {
  try {
    const r = spawnSync('nmap', ['--version'], { timeout: 5000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// Parse nmap XML (-oX) into Panoptes ScanHost records.
export function parseNmapXml(xml: string): ScanHost[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const hosts = asArray(doc?.nmaprun?.host);
  const out: ScanHost[] = [];

  for (const host of hosts) {
    const status = host?.status?.['@_state'];
    if (status && status !== 'up') continue;

    const addresses = asArray(host?.address);
    const ipv4 = addresses.find((a: any) => a['@_addrtype'] === 'ipv4');
    const ip = ipv4?.['@_addr'];
    if (!ip) continue;

    const hostnames = asArray(host?.hostnames?.hostname);
    const hostname = hostnames[0]?.['@_name'];

    const osMatches = asArray(host?.os?.osmatch);
    const osGuess = osMatches[0]?.['@_name'];

    const ports: ScanPort[] = asArray(host?.ports?.port).map((p: any) => ({
      port: parseInt(p['@_portid'], 10),
      protocol: p['@_protocol'] || 'tcp',
      state: p?.state?.['@_state'] || 'unknown',
      service: p?.service?.['@_name'],
      product: p?.service?.['@_product'],
      version: p?.service?.['@_version'],
    }));

    out.push({ ip, hostname, osGuess, ports });
  }
  return out;
}

export interface NmapOptions {
  // nmap arg string; defaults to a service+OS detection of common ports.
  args?: string[];
  onProgress?: (line: string) => void;
}

export function runNmap(target: string, opts: NmapOptions = {}): Promise<ScanHost[]> {
  return new Promise((resolve, reject) => {
    const args = opts.args || ['-sS', '-sV', '-O', '--top-ports', '200', '-T4'];
    const proc = spawn('nmap', [...args, '-oX', '-', target]);
    let xml = '';
    let stderr = '';
    let lineBuf = '';
    proc.stdout.on('data', (d) => {
      xml += d.toString();
    });
    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      // Buffer and split into whole lines so the progress/host regexes in the
      // scanner see complete messages rather than arbitrary stream chunks.
      lineBuf += chunk;
      const lines = lineBuf.split(/\r?\n/);
      lineBuf = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) opts.onProgress?.(line);
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      // nmap may exit non-zero on partial scans but still produce XML.
      if (!xml.includes('<nmaprun')) {
        reject(new Error(`nmap failed (code ${code}): ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(parseNmapXml(xml));
      } catch (e) {
        reject(e);
      }
    });
  });
}
