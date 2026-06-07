import { Router } from 'express';
import { db } from '../db';
import { getModule } from '../modules/loader';
import { runTask } from '../modules/runner';
import { emitTaskLog, emitTaskStatus } from '../events';

export const tasksRouter = Router();

const emitters = { onLog: emitTaskLog, onStatus: emitTaskStatus };

interface TaskRow {
  id: number;
  system_id: number;
  module_id: string;
  module_name: string | null;
  params_json: string;
  status: string;
  exit_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function hydrate(t: TaskRow) {
  return {
    id: t.id,
    systemId: t.system_id,
    moduleId: t.module_id,
    moduleName: t.module_name,
    params: JSON.parse(t.params_json || '{}'),
    status: t.status,
    exitMessage: t.exit_message,
    startedAt: t.started_at,
    finishedAt: t.finished_at,
    createdAt: t.created_at,
  };
}

// Queue one or more modules against a system and start running them in the
// background. Returns the created task ids; live output streams over Socket.IO
// (room "task:<id>").
tasksRouter.post('/', (req, res) => {
  const { systemId, modules } = req.body || {};
  // `modules` = [{ moduleId, params }]
  if (!systemId || !Array.isArray(modules) || modules.length === 0) {
    res.status(400).json({ error: 'systemId and a non-empty modules array are required' });
    return;
  }
  const system = db.prepare('SELECT id FROM systems WHERE id = ?').get(systemId);
  if (!system) {
    res.status(404).json({ error: 'system not found' });
    return;
  }

  const created: number[] = [];
  for (const m of modules) {
    const mod = getModule(m.moduleId);
    const info = db
      .prepare(
        'INSERT INTO tasks (system_id, module_id, module_name, params_json, status) VALUES (?, ?, ?, ?, ?)'
      )
      .run(systemId, m.moduleId, mod?.manifest.name ?? m.moduleId, JSON.stringify(m.params || {}), 'pending');
    created.push(Number(info.lastInsertRowid));
  }

  // Run sequentially per request so output is readable; do not block the response.
  void (async () => {
    for (const taskId of created) {
      try {
        await runTask(taskId, emitters);
      } catch {
        /* status already recorded by runTask */
      }
    }
  })();

  res.json({ taskIds: created });
});

tasksRouter.get('/', (req, res) => {
  const { systemId } = req.query;
  const rows = systemId
    ? (db.prepare('SELECT * FROM tasks WHERE system_id = ? ORDER BY id DESC').all(systemId) as TaskRow[])
    : (db.prepare('SELECT * FROM tasks ORDER BY id DESC LIMIT 100').all() as TaskRow[]);
  res.json(rows.map(hydrate));
});

tasksRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as
    | TaskRow
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'task not found' });
    return;
  }
  const logs = db
    .prepare('SELECT ts, stream, line FROM task_logs WHERE task_id = ? ORDER BY id')
    .all(req.params.id);
  res.json({ ...hydrate(row), logs });
});
