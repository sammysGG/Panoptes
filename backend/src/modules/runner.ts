import { db } from '../db';
import { LogStream, ModuleContext, TaskStatus } from '../types';
import { getModule } from './loader';
import { resolveCredential } from '../credentials';
import { connect } from '../ssh/executor';

export interface TaskLogEvent {
  taskId: number;
  ts: string;
  stream: LogStream;
  line: string;
}

export interface TaskStatusEvent {
  taskId: number;
  status: TaskStatus;
  message?: string;
}

export interface RunnerEmitters {
  onLog: (e: TaskLogEvent) => void;
  onStatus: (e: TaskStatusEvent) => void;
}

interface SystemRow {
  id: number;
  ip: string;
  hostname: string | null;
  detected_type: string | null;
}

function setStatus(taskId: number, status: TaskStatus, message?: string): void {
  if (status === 'running') {
    db.prepare("UPDATE tasks SET status=?, started_at=datetime('now') WHERE id=?").run(
      status,
      taskId
    );
  } else {
    db.prepare(
      "UPDATE tasks SET status=?, exit_message=?, finished_at=datetime('now') WHERE id=?"
    ).run(status, message ?? null, taskId);
  }
}

function persistLog(taskId: number, line: string, stream: LogStream): TaskLogEvent {
  const ts = new Date().toISOString();
  db.prepare('INSERT INTO task_logs (task_id, ts, stream, line) VALUES (?, ?, ?, ?)').run(
    taskId,
    ts,
    stream,
    line
  );
  return { taskId, ts, stream, line };
}

// Execute a single queued task end-to-end: resolve credential, open SSH, run the
// module, stream + persist output, and record the final status.
export async function runTask(taskId: number, emit: RunnerEmitters): Promise<void> {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!task) throw new Error(`task ${taskId} not found`);

  const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(task.system_id) as
    | SystemRow
    | undefined;
  if (!system) throw new Error('system not found');

  const mod = getModule(task.module_id);
  const log = (line: string, stream: LogStream = 'stdout') => {
    emit.onLog(persistLog(taskId, line, stream));
  };

  setStatus(taskId, 'running');
  emit.onStatus({ taskId, status: 'running' });

  if (!mod) {
    log(`module "${task.module_id}" is not installed`, 'stderr');
    setStatus(taskId, 'failed', 'module not installed');
    emit.onStatus({ taskId, status: 'failed', message: 'module not installed' });
    return;
  }

  if (mod.manifest.experimental && mod.manifest.channel === 'winrm') {
    log(`Module "${mod.manifest.name}" requires WinRM remoting, which is not yet available.`, 'info');
    log('This Windows definition is shown for planning; SSH modules are executable today.', 'info');
    setStatus(taskId, 'failed', 'winrm not yet supported');
    emit.onStatus({ taskId, status: 'failed', message: 'winrm not yet supported' });
    return;
  }

  const cred = resolveCredential(system.id);
  if (!cred) {
    log('No credential is configured for this system. Add one and retry.', 'stderr');
    setStatus(taskId, 'failed', 'no credential');
    emit.onStatus({ taskId, status: 'failed', message: 'no credential' });
    return;
  }

  let closeConn: (() => void) | null = null;
  try {
    log(`Connecting to ${system.ip}:${cred.port} as ${cred.username}...`, 'info');
    const { handle, close } = await connect({ host: system.ip, cred, log });
    closeConn = close;
    log('Connected. Running module...', 'info');

    const ctx: ModuleContext = {
      ssh: handle,
      params: JSON.parse(task.params_json || '{}'),
      system: {
        id: system.id,
        ip: system.ip,
        hostname: system.hostname || undefined,
        detectedType: system.detected_type || undefined,
      },
      log,
    };

    await mod.run(ctx);
    log('Module completed successfully.', 'info');
    setStatus(taskId, 'success', 'completed');
    emit.onStatus({ taskId, status: 'success', message: 'completed' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`Task failed: ${message}`, 'stderr');
    setStatus(taskId, 'failed', message);
    emit.onStatus({ taskId, status: 'failed', message });
  } finally {
    if (closeConn) closeConn();
  }
}
