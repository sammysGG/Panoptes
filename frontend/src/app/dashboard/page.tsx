'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';

import { api, type Stats } from '@/lib/api';

function StatCard({ label, value, color }: { label: string; value: React.ReactNode; color?: string }): React.JSX.Element {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography color="text.secondary" variant="overline">
            {label}
          </Typography>
          <Typography variant="h3" sx={{ color }}>
            {value}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  success: 'success',
  failed: 'error',
  running: 'warning',
  pending: 'info',
};

export default function Page(): React.JSX.Element {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api
      .get<Stats>('/api/stats')
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <Typography color="error">Failed to load overview: {error}</Typography>;
  }
  if (!stats) {
    return <Typography color="text.secondary">Loading overview…</Typography>;
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Overview</Typography>
      <Grid container spacing={3}>
        <Grid size={{ lg: 3, sm: 6, xs: 12 }}>
          <StatCard label="Systems" value={stats.systemCount} />
        </Grid>
        <Grid size={{ lg: 3, sm: 6, xs: 12 }}>
          <StatCard label="Tasks run" value={stats.taskTotal} />
        </Grid>
        <Grid size={{ lg: 3, sm: 6, xs: 12 }}>
          <StatCard label="Hardened OK" value={stats.tasks.success || 0} color="#16a34a" />
        </Grid>
        <Grid size={{ lg: 3, sm: 6, xs: 12 }}>
          <StatCard label="Failed" value={stats.tasks.failed || 0} color="#dc2626" />
        </Grid>

        <Grid size={{ md: 6, xs: 12 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Systems by type" />
            <Divider />
            <CardContent>
              {stats.byType.length === 0 ? (
                <Typography color="text.secondary">No systems yet. Run a scan to discover hosts.</Typography>
              ) : (
                <Stack spacing={1}>
                  {stats.byType.map((t) => (
                    <Stack key={t.type} direction="row" justifyContent="space-between">
                      <Typography>{t.type}</Typography>
                      <Chip label={t.count} size="small" />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ md: 6, xs: 12 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title="Recent tasks"
              subheader={
                stats.lastScan
                  ? `Last scan: ${stats.lastScan.cidr} (${stats.lastScan.host_count} hosts, ${stats.lastScan.method})`
                  : 'No scans yet'
              }
            />
            <Divider />
            <CardContent>
              {stats.recentTasks.length === 0 ? (
                <Typography color="text.secondary">No tasks have run yet.</Typography>
              ) : (
                <List dense>
                  {stats.recentTasks.map((t) => (
                    <ListItem
                      key={t.id}
                      secondaryAction={<Chip color={statusColor[t.status] || 'default'} label={t.status} size="small" />}
                    >
                      <ListItemText primary={t.module_name} secondary={t.ip} />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
