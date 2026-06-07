'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { api, type ModuleManifest } from '@/lib/api';

export default function Page(): React.JSX.Element {
  const [modules, setModules] = React.useState<ModuleManifest[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(() => {
    api
      .get<ModuleManifest[]>('/api/modules')
      .then(setModules)
      .catch((e) => setError(e.message));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('module', file);
    try {
      const res = await api.upload<{ id: string }>('/api/modules/import', form);
      setMsg(`Imported module "${res.id}".`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Modules</Typography>
        <Button variant="contained" onClick={() => fileRef.current?.click()}>
          Import module (.zip)
        </Button>
        <input ref={fileRef} type="file" accept=".zip" hidden onChange={onUpload} />
      </Stack>

      <Typography color="text.secondary" variant="body2">
        A module is a folder containing <code>module.json</code> and <code>run.js</code>. Drop it into the
        server&apos;s <code>modules/</code> directory or upload it here as a .zip.
      </Typography>

      {msg ? <Alert color="success" onClose={() => setMsg(null)}>{msg}</Alert> : null}
      {error ? <Alert color="error" onClose={() => setError(null)}>{error}</Alert> : null}

      <Grid container spacing={2}>
        {modules.map((m) => (
          <Grid key={m.id} size={{ md: 6, xs: 12 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardHeader
                title={m.name}
                subheader={`${m.category} · v${m.version}`}
                action={m.experimental ? <Chip label="experimental" size="small" color="warning" /> : null}
              />
              <Divider />
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    {m.description}
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color="text.secondary">
                      Applies to:
                    </Typography>
                    {m.appliesTo.map((a) => (
                      <Chip key={a} label={a} size="small" variant="outlined" />
                    ))}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {m.params.length} parameter(s) · channel: {m.channel || 'ssh'}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
