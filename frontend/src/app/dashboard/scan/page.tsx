'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { api, type EnrichedHost, type ScanRecord } from '@/lib/api';
import { getSocket } from '@/lib/socket';

// Mirrors the backend ScanProgress payload streamed over Socket.IO.
interface ScanProgress {
  scanId: number;
  status: 'running' | 'done' | 'failed';
  phase?: string;
  done?: number;
  total?: number;
  percent?: number;
  found?: number;
  message?: string;
  host?: EnrichedHost;
}

export default function Page(): React.JSX.Element {
  const router = useRouter();
  const [cidr, setCidr] = React.useState('10.0.0.0/24');
  const [forceFallback, setForceFallback] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [phase, setPhase] = React.useState<string>('');
  const [percent, setPercent] = React.useState<number | null>(null);
  const [found, setFound] = React.useState(0);
  const [log, setLog] = React.useState<string[]>([]);
  const [elapsed, setElapsed] = React.useState(0);
  const [hosts, setHosts] = React.useState<EnrichedHost[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [imported, setImported] = React.useState<number | null>(null);
  const [scanId, setScanId] = React.useState<number | null>(null);

  const logRef = React.useRef<HTMLDivElement | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll the live console to the newest line.
  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  function appendLog(line: string): void {
    setLog((prev) => {
      const next = [...prev, line];
      // Keep the console bounded so long scans don't grow memory unbounded.
      return next.length > 300 ? next.slice(next.length - 300) : next;
    });
  }

  async function runScan(): Promise<void> {
    setScanning(true);
    setError(null);
    setHosts([]);
    setSelected(new Set());
    setImported(null);
    setFound(0);
    setPercent(null);
    setPhase('starting');
    setLog([]);
    setElapsed(0);
    setScanId(null);

    const started = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    const socket = getSocket();
    // Live host list is built up as discoveries stream in (TCP-sweep path).
    const liveHosts = new Map<string, EnrichedHost>();
    let activeScanId: number | null = null;

    const finish = (): void => {
      socket.off('scan:any', onAny);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setScanning(false);
    };

    const onAny = (p: ScanProgress): void => {
      // Only react to our own scan once we know its id (filters the global feed).
      if (activeScanId != null && p.scanId !== activeScanId) return;
      if (p.phase) setPhase(p.phase);
      if (p.percent != null) setPercent(p.percent);
      if (p.found != null) setFound(p.found);
      if (p.message) appendLog(p.message);
      else if (p.done != null && p.total != null) appendLog(`Swept ${p.done}/${p.total} hosts`);

      if (p.host) {
        liveHosts.set(p.host.ip, p.host);
        setHosts(Array.from(liveHosts.values()));
        setSelected(new Set(liveHosts.keys()));
      }

      if (p.status === 'done' && activeScanId != null) {
        void api
          .get<ScanRecord>(`/api/scans/${activeScanId}`)
          .then((full) => {
            const canonical = full.hosts || [];
            setHosts(canonical);
            setSelected(new Set(canonical.map((h) => h.ip)));
            setFound(canonical.length);
          })
          .finally(finish);
      } else if (p.status === 'failed') {
        setError(p.message || 'Scan failed');
        finish();
      }
    };

    socket.on('scan:any', onAny);

    try {
      const scan = await api.post<ScanRecord>('/api/scans', { cidr, forceFallback });
      activeScanId = scan.id;
      setScanId(scan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      finish();
    }
  }

  function toggle(ip: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  }

  async function importSelected(): Promise<void> {
    if (scanId == null) return;
    try {
      const res = await api.post<{ imported: number }>(`/api/scans/${scanId}/import`, {
        ips: Array.from(selected),
      });
      setImported(res.imported);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Scan network</Typography>

      <Card>
        <CardHeader title="Target range" subheader="CIDR (10.0.0.0/24), range (10.0.0.1-10.0.0.50), or a single IP" />
        <Divider />
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <TextField
              label="Target"
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              fullWidth
              disabled={scanning}
            />
            <FormControlLabel
              control={<Checkbox checked={forceFallback} onChange={(e) => setForceFallback(e.target.checked)} disabled={scanning} />}
              label="Force TCP sweep"
            />
            <Button variant="contained" onClick={runScan} disabled={scanning || !cidr}>
              {scanning ? 'Scanning…' : 'Scan'}
            </Button>
          </Stack>

          {scanning || log.length > 0 ? (
            <Box sx={{ mt: 3 }}>
              <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip size="small" color="primary" label={`Phase: ${phase || '—'}`} />
                <Chip size="small" label={`Found: ${found}`} />
                <Chip size="small" label={`Elapsed: ${elapsed}s`} />
                {percent != null ? <Chip size="small" label={`${Math.round(percent)}%`} /> : null}
              </Stack>
              <LinearProgress variant={percent != null ? 'determinate' : 'indeterminate'} value={percent ?? undefined} />
              <Box
                ref={logRef}
                sx={{
                  mt: 2,
                  maxHeight: 200,
                  overflowY: 'auto',
                  bgcolor: 'var(--mui-palette-neutral-950, #0b0d12)',
                  color: 'var(--mui-palette-neutral-100, #e6e8ec)',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  lineHeight: 1.5,
                  p: 1.5,
                  borderRadius: 1,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {log.length === 0 ? '…' : log.map((line, i) => <div key={i}>{line}</div>)}
              </Box>
            </Box>
          ) : null}

          {error ? (
            <Alert color="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {hosts.length > 0 ? (
        <Card>
          <CardHeader
            title={`Discovered hosts (${hosts.length})`}
            action={
              <Button variant="contained" onClick={importSelected} disabled={selected.size === 0 || scanId == null}>
                Import {selected.size} to board
              </Button>
            }
          />
          <Divider />
          <CardContent>
            {imported != null ? (
              <Alert color="success" sx={{ mb: 2 }} onClose={() => setImported(null)}>
                Imported {imported} system(s).{' '}
                <Button size="small" onClick={() => router.push('/dashboard/systems')}>
                  Go to Systems
                </Button>
              </Alert>
            ) : null}
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>IP</TableCell>
                  <TableCell>Hostname</TableCell>
                  <TableCell>Detected type</TableCell>
                  <TableCell>Open ports</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {hosts.map((h) => (
                  <TableRow key={h.ip} hover>
                    <TableCell padding="checkbox">
                      <Checkbox checked={selected.has(h.ip)} onChange={() => toggle(h.ip)} />
                    </TableCell>
                    <TableCell>{h.ip}</TableCell>
                    <TableCell>{h.hostname || '—'}</TableCell>
                    <TableCell>
                      {h.definitionName ? <Chip label={h.definitionName} size="small" color="primary" /> : <Chip label="Unclassified" size="small" />}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {h.ports.map((p) => p.port).join(', ')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
