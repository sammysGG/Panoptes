'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { api, type ModuleManifest, type ModuleParam, type SystemSummary, type TaskRecord } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const statusColor: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  success: 'success',
  failed: 'error',
  running: 'warning',
  pending: 'info',
};

interface LogLine {
  taskId: number;
  ts: string;
  stream: string;
  line: string;
}

export default function Page(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const systemId = Number(params.id);

  const [system, setSystem] = React.useState<SystemSummary | null>(null);
  const [tasks, setTasks] = React.useState<TaskRecord[]>([]);
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [runModule, setRunModule] = React.useState<ModuleManifest | null>(null);

  const refresh = React.useCallback(async () => {
    setSystem(await api.get<SystemSummary>(`/api/systems/${systemId}`));
    setTasks(await api.get<TaskRecord[]>(`/api/tasks?systemId=${systemId}`));
  }, [systemId]);

  React.useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);

  // Subscribe to live task output for this system.
  React.useEffect(() => {
    const socket = getSocket();
    const onLog = (e: LogLine): void => setLogs((prev) => [...prev.slice(-400), e]);
    const onStatus = (): void => {
      refresh().catch(() => undefined);
    };
    socket.on('task:log', onLog);
    socket.on('task:any', onStatus);
    return () => {
      socket.off('task:log', onLog);
      socket.off('task:any', onStatus);
    };
  }, [refresh]);

  async function startTask(moduleId: string, paramValues: Record<string, unknown>): Promise<void> {
    setLogs([]);
    const { taskIds } = await api.post<{ taskIds: number[] }>('/api/tasks', {
      systemId,
      modules: [{ moduleId, params: paramValues }],
    });
    const socket = getSocket();
    taskIds.forEach((id) => socket.emit('subscribe:task', id));
    setRunModule(null);
    refresh().catch(() => undefined);
  }

  if (error) return <Alert color="error">{error}</Alert>;
  if (!system) return <Typography color="text.secondary">Loading…</Typography>;

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack>
          <Typography variant="h4">{system.ip}</Typography>
          <Typography color="text.secondary">
            {system.hostname || 'no hostname'} · {system.detectedType || 'Unclassified'}
          </Typography>
        </Stack>
        <Chip label={system.status} />
      </Stack>

      <Grid container spacing={3}>
        <Grid size={{ md: 6, xs: 12 }}>
          <CredentialCard system={system} onSaved={refresh} />
        </Grid>
        <Grid size={{ md: 6, xs: 12 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Open ports" />
            <Divider />
            <CardContent>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {system.openPorts.length === 0 ? (
                  <Typography color="text.secondary">None recorded</Typography>
                ) : (
                  system.openPorts.map((p) => (
                    <Chip key={p.port} label={`${p.port}${p.service ? ' / ' + p.service : ''}`} size="small" />
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardHeader title="Hardening modules" subheader="Run a task to apply hardening over SSH" />
        <Divider />
        <CardContent>
          {system.availableModules.length === 0 ? (
            <Typography color="text.secondary">
              No modules apply to this system type. Adjust its definition or add a module.
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {system.availableModules.map((m) => (
                <Grid key={m.id} size={{ md: 6, xs: 12 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle1">{m.name}</Typography>
                          {m.experimental ? <Chip label="experimental" size="small" color="warning" /> : null}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {m.description}
                        </Typography>
                        <Box>
                          <Button
                            variant="contained"
                            size="small"
                            disabled={!system.credential}
                            onClick={() => setRunModule(m)}
                          >
                            Configure &amp; run
                          </Button>
                          {!system.credential ? (
                            <Typography variant="caption" color="error" sx={{ ml: 1 }}>
                              add a credential first
                            </Typography>
                          ) : null}
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Live output" />
        <Divider />
        <CardContent>
          <Box
            sx={{
              bgcolor: '#0b1120',
              color: '#d1d5db',
              fontFamily: 'var(--mui-font-mono, monospace)',
              fontSize: 13,
              p: 2,
              borderRadius: 1,
              height: 260,
              overflow: 'auto',
            }}
          >
            {logs.length === 0 ? (
              <Typography sx={{ color: '#6b7280' }} variant="body2">
                Run a module to stream its output here…
              </Typography>
            ) : (
              logs.map((l, i) => (
                <div key={i} style={{ color: l.stream === 'stderr' ? '#f87171' : l.stream === 'info' ? '#60a5fa' : '#d1d5db' }}>
                  {l.line}
                </div>
              ))
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Task history" />
        <Divider />
        <CardContent>
          {tasks.length === 0 ? (
            <Typography color="text.secondary">No tasks yet.</Typography>
          ) : (
            <Stack spacing={1}>
              {tasks.map((t) => (
                <Stack key={t.id} direction="row" justifyContent="space-between" alignItems="center">
                  <Typography>{t.moduleName || t.moduleId}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {t.exitMessage ? (
                      <Typography variant="caption" color="text.secondary">
                        {t.exitMessage}
                      </Typography>
                    ) : null}
                    <Chip size="small" color={statusColor[t.status] || 'default'} label={t.status} />
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {runModule ? (
        <RunDialog module={runModule} onClose={() => setRunModule(null)} onRun={(vals) => startTask(runModule.id, vals)} />
      ) : null}
    </Stack>
  );
}

function CredentialCard({ system, onSaved }: { system: SystemSummary; onSaved: () => Promise<void> }): React.JSX.Element {
  const [username, setUsername] = React.useState(system.credential?.username || 'root');
  const [port, setPort] = React.useState(system.credential?.port || 22);
  const [authType, setAuthType] = React.useState<'password' | 'key'>(
    (system.credential?.authType as 'password' | 'key') || 'key'
  );
  const [secret, setSecret] = React.useState('');
  const [passphrase, setPassphrase] = React.useState('');
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function save(): Promise<void> {
    setErr(null);
    setMsg(null);
    try {
      await api.put(`/api/systems/${system.id}/credential`, { username, port, authType, secret, passphrase });
      setSecret('');
      setPassphrase('');
      setMsg('Credential saved (encrypted at rest).');
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="SSH credential"
        subheader={system.credential ? `Set: ${system.credential.username}@:${system.credential.port}` : 'Not configured'}
      />
      <Divider />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} fullWidth />
            <TextField
              label="Port"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              sx={{ width: 120 }}
            />
          </Stack>
          <TextField select label="Auth type" value={authType} onChange={(e) => setAuthType(e.target.value as 'password' | 'key')}>
            <MenuItem value="key">Private key</MenuItem>
            <MenuItem value="password">Password</MenuItem>
          </TextField>
          <TextField
            label={authType === 'key' ? 'Private key (PEM)' : 'Password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            multiline={authType === 'key'}
            minRows={authType === 'key' ? 4 : 1}
            type={authType === 'password' ? 'password' : 'text'}
            placeholder={system.credential ? 'Leave blank to keep existing' : ''}
            fullWidth
          />
          {authType === 'key' ? (
            <TextField
              label="Key passphrase (optional)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              type="password"
              fullWidth
            />
          ) : null}
          {msg ? <Alert color="success">{msg}</Alert> : null}
          {err ? <Alert color="error">{err}</Alert> : null}
          <Button variant="contained" onClick={save} disabled={!secret}>
            Save credential
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function RunDialog({
  module,
  onClose,
  onRun,
}: {
  module: ModuleManifest;
  onClose: () => void;
  onRun: (values: Record<string, unknown>) => void;
}): React.JSX.Element {
  const [values, setValues] = React.useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const p of module.params) init[p.name] = p.default ?? (p.type === 'boolean' ? false : '');
    return init;
  });

  function set(name: string, v: unknown): void {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  function field(p: ModuleParam): React.JSX.Element {
    if (p.type === 'boolean') {
      return (
        <FormControlLabel
          key={p.name}
          control={<Switch checked={!!values[p.name]} onChange={(e) => set(p.name, e.target.checked)} />}
          label={p.label}
        />
      );
    }
    return (
      <TextField
        key={p.name}
        label={p.label}
        helperText={p.help}
        required={p.required}
        value={values[p.name] ?? ''}
        onChange={(e) => set(p.name, p.type === 'number' ? Number(e.target.value) : e.target.value)}
        type={p.type === 'secret' ? 'password' : p.type === 'number' ? 'number' : 'text'}
        multiline={p.type === 'text'}
        minRows={p.type === 'text' ? 3 : 1}
        fullWidth
      />
    );
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{module.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {module.description}
          </Typography>
          {module.params.map(field)}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onRun(values)}>
          Run module
        </Button>
      </DialogActions>
    </Dialog>
  );
}
