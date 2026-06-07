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

import { api, type SystemDefinition } from '@/lib/api';

export default function Page(): React.JSX.Element {
  const [defs, setDefs] = React.useState<SystemDefinition[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api
      .get<SystemDefinition[]>('/api/definitions')
      .then(setDefs)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <Stack spacing={3}>
      <Typography variant="h4">System definitions</Typography>
      <Typography color="text.secondary" variant="body2">
        Definitions classify scanned hosts into system types using port, OS, and banner rules, and map each
        type to its default hardening modules. Built-in definitions ship with Panoptes; add your own as JSON
        in <code>system-definitions/</code>.
      </Typography>
      {error ? <Typography color="error">{error}</Typography> : null}

      <Grid container spacing={2}>
        {defs.map((d) => (
          <Grid key={d.id} size={{ md: 6, xs: 12 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardHeader
                title={d.name}
                subheader={d.id}
                action={
                  <Stack direction="row" spacing={1}>
                    <Chip label={d.channel || 'ssh'} size="small" />
                    {d.builtin ? <Chip label="builtin" size="small" color="primary" /> : <Chip label="custom" size="small" />}
                  </Stack>
                }
              />
              <Divider />
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    {d.description}
                  </Typography>
                  <Box label="Match rules" value={JSON.stringify(d.match)} />
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      Default modules:
                    </Typography>
                    {d.defaultModuleIds.length ? (
                      d.defaultModuleIds.map((m) => <Chip key={m} label={m} size="small" variant="outlined" />)
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        none
                      </Typography>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

function Box({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'var(--mui-palette-background-level1, #f4f6f8)', p: 1, borderRadius: 1, wordBreak: 'break-all' }}
      >
        {value}
      </Typography>
    </Stack>
  );
}
