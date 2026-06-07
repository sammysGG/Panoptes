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

export default function Page(): React.JSX.Element {
  const router = useRouter();
  const [cidr, setCidr] = React.useState('10.0.0.0/24');
  const [forceFallback, setForceFallback] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState<string>('');
  const [hosts, setHosts] = React.useState<EnrichedHost[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [imported, setImported] = React.useState<number | null>(null);

  async function runScan(): Promise<void> {
    setScanning(true);
    setError(null);
    setHosts([]);
    setImported(null);
    setProgress('Starting scan…');
    const socket = getSocket();
    const onAny = (p: { message?: string; done?: number; total?: number }): void => {
      if (p.message) setProgress(p.message);
      else if (p.done != null && p.total != null) setProgress(`Swept ${p.done}/${p.total} hosts`);
    };
    socket.on('scan:any', onAny);
    try {
      const scan = await api.post<ScanRecord>('/api/scans', { cidr, forceFallback });
      const full = await api.get<ScanRecord>(`/api/scans/${scan.id}`);
      const found = full.hosts || [];
      setHosts(found);
      setSelected(new Set(found.map((h) => h.ip)));
      setProgress(`Found ${found.length} host(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      socket.off('scan:any', onAny);
      setScanning(false);
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
    try {
      const res = await api.post<{ imported: number }>(
        `/api/scans/${(await latestScanId())}/import`,
        { ips: Array.from(selected) }
      );
      setImported(res.imported);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // The most recent scan is the one we just ran; fetch its id from the list.
  async function latestScanId(): Promise<number> {
    const scans = await api.get<{ id: number }[]>('/api/scans');
    return scans[0].id;
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
              control={<Checkbox checked={forceFallback} onChange={(e) => setForceFallback(e.target.checked)} />}
              label="Force TCP sweep"
            />
            <Button variant="contained" onClick={runScan} disabled={scanning || !cidr}>
              {scanning ? 'Scanning…' : 'Scan'}
            </Button>
          </Stack>
          {scanning ? (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                {progress}
              </Typography>
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
              <Button variant="contained" onClick={importSelected} disabled={selected.size === 0}>
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
