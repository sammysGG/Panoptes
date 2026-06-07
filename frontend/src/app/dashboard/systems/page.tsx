'use client';

import * as React from 'react';
import RouterLink from 'next/link';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

import { api, type SystemSummary } from '@/lib/api';

export default function Page(): React.JSX.Element {
  const [systems, setSystems] = React.useState<SystemSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api
      .get<SystemSummary[]>('/api/systems')
      .then(setSystems)
      .catch((e) => setError(e.message));
  }, []);

  // Group systems by their detected type for the board layout.
  const groups = React.useMemo(() => {
    const map = new Map<string, SystemSummary[]>();
    for (const s of systems) {
      const key = s.detectedType || 'Unclassified';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [systems]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Systems</Typography>
        <Button variant="contained" component={RouterLink} href="/dashboard/scan">
          Scan network
        </Button>
      </Stack>

      {error ? <Typography color="error">{error}</Typography> : null}
      {systems.length === 0 && !error ? (
        <Typography color="text.secondary">
          No systems yet. Run a scan and import discovered hosts to populate the board.
        </Typography>
      ) : null}

      {groups.map(([type, items]) => (
        <Stack key={type} spacing={1}>
          <Typography variant="h6" color="text.secondary">
            {type} ({items.length})
          </Typography>
          <Grid container spacing={2}>
            {items.map((s) => (
              <Grid key={s.id} size={{ md: 4, sm: 6, xs: 12 }}>
                <Card variant="outlined">
                  <CardActionArea component={RouterLink} href={`/dashboard/systems/${s.id}`}>
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="h6">{s.ip}</Typography>
                          <Chip
                            size="small"
                            color={s.credential ? 'success' : 'default'}
                            label={s.credential ? 'creds set' : 'no creds'}
                          />
                        </Stack>
                        {s.hostname ? (
                          <Typography variant="body2" color="text.secondary">
                            {s.hostname}
                          </Typography>
                        ) : null}
                        <Typography variant="caption" color="text.secondary">
                          Ports: {s.openPorts.map((p) => p.port).join(', ') || '—'}
                        </Typography>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {s.availableModules.slice(0, 4).map((m) => (
                            <Chip key={m.id} label={m.name} size="small" variant="outlined" />
                          ))}
                          {s.availableModules.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                              No applicable modules
                            </Typography>
                          ) : null}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Stack>
      ))}
    </Stack>
  );
}
