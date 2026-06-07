// Minimal IPv4 CIDR / range / single-host expander. Caps output to avoid runaway sweeps.
const MAX_HOSTS = 4096;

function ipToInt(ip: string): number {
  const parts = ip.trim().split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`invalid IPv4 address: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

// Accepts: "10.0.0.5", "10.0.0.0/24", "10.0.0.1-10.0.0.50".
export function expandTargets(input: string): string[] {
  const spec = input.trim();
  if (spec.includes('/')) {
    const [base, bitsStr] = spec.split('/');
    const bits = parseInt(bitsStr, 10);
    if (bits < 0 || bits > 32) throw new Error(`invalid CIDR bits: ${bitsStr}`);
    const baseInt = ipToInt(base);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    const network = (baseInt & mask) >>> 0;
    const size = 2 ** (32 - bits);
    const hosts: string[] = [];
    // For /31 and /32 include all addresses; otherwise skip network + broadcast.
    const start = bits >= 31 ? 0 : 1;
    const end = bits >= 31 ? size : size - 1;
    for (let i = start; i < end && hosts.length < MAX_HOSTS; i++) {
      hosts.push(intToIp((network + i) >>> 0));
    }
    return hosts;
  }
  if (spec.includes('-')) {
    const [a, b] = spec.split('-');
    const start = ipToInt(a);
    const end = ipToInt(b);
    if (end < start) throw new Error('range end before start');
    const hosts: string[] = [];
    for (let i = start; i <= end && hosts.length < MAX_HOSTS; i++) {
      hosts.push(intToIp(i >>> 0));
    }
    return hosts;
  }
  return [intToIp(ipToInt(spec))];
}
