import { Router } from 'express';
import { db } from '../db';

export const statsRouter = Router();

// Aggregate counts for the Panoptes overview dashboard.
statsRouter.get('/', (_req, res) => {
  const systemCount = (db.prepare('SELECT COUNT(*) c FROM systems').get() as any).c;
  const byType = db
    .prepare(
      "SELECT COALESCE(detected_type, 'Unclassified') AS type, COUNT(*) AS count FROM systems GROUP BY type ORDER BY count DESC"
    )
    .all();
  const taskStatus = db
    .prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status')
    .all() as { status: string; count: number }[];
  const statusMap: Record<string, number> = { pending: 0, running: 0, success: 0, failed: 0 };
  for (const r of taskStatus) statusMap[r.status] = r.count;
  const lastScan = db
    .prepare('SELECT id, cidr, method, status, host_count, started_at, finished_at FROM scans ORDER BY id DESC LIMIT 1')
    .get();
  const recentTasks = db
    .prepare(
      `SELECT t.id, t.module_name, t.status, t.finished_at, s.ip
       FROM tasks t JOIN systems s ON s.id = t.system_id
       ORDER BY t.id DESC LIMIT 8`
    )
    .all();

  res.json({
    systemCount,
    byType,
    tasks: statusMap,
    taskTotal: Object.values(statusMap).reduce((a, b) => a + b, 0),
    lastScan,
    recentTasks,
  });
});
