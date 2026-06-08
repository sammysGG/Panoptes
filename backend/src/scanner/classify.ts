import { listDefinitions } from '../definitions';
import { ScanHost, SystemDefinition } from '../types';

export interface Classification {
  definitionId: string | null;
  definitionName: string | null;
  score: number;
}

// Score how well a scanned host matches a single definition.
// Returns a number > 0 when it matches, or 0 when it does not.
function scoreDefinition(host: ScanHost, def: SystemDefinition): number {
  const openPorts = new Set(
    host.ports.filter((p) => p.state === 'open').map((p) => p.port)
  );
  const m = def.match;
  let score = 0;

  if (m.allPorts && m.allPorts.length) {
    const hasAll = m.allPorts.every((p) => openPorts.has(p));
    if (!hasAll) return 0;
    score += m.allPorts.length * 2;
  }

  if (m.anyPorts && m.anyPorts.length) {
    const hits = m.anyPorts.filter((p) => openPorts.has(p));
    if (hits.length === 0 && !(m.allPorts && m.allPorts.length)) return 0;
    score += hits.length;
  }

  const os = (host.osGuess || '').toLowerCase();
  let osHit = false;
  if (m.osIncludes && m.osIncludes.length) {
    osHit = m.osIncludes.some((s) => os.includes(s.toLowerCase()));
    if (osHit) score += 3;
  }

  let bannerHit = false;
  if (m.bannerIncludes && m.bannerIncludes.length) {
    const banners = host.ports
      .map((p) => `${p.service || ''} ${p.product || ''} ${p.version || ''}`.toLowerCase())
      .join(' ');
    bannerHit = m.bannerIncludes.some((s) => banners.includes(s.toLowerCase()));
    if (bannerHit) score += 4;
  }

  // Specialised definitions (e.g. pfSense) must be confirmed by an OS or banner
  // signal — matching open ports alone is not enough to claim the type. This
  // prevents generic Linux web/SSH routers from being labelled pfSense.
  if (m.requireSignal && !osHit && !bannerHit) return 0;

  if (score > 0) score += m.weight || 0;
  return score;
}

// Pick the best-matching definition for a scanned host.
export function classifyHost(host: ScanHost): Classification {
  const defs = listDefinitions();
  let best: Classification = { definitionId: null, definitionName: null, score: 0 };
  for (const def of defs) {
    const score = scoreDefinition(host, def);
    if (score > best.score) {
      best = { definitionId: def.id, definitionName: def.name, score };
    }
  }
  return best;
}
