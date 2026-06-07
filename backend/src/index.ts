import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config';
import { db } from './db';
import { seedAdmin, requireAuth } from './auth';
import { seedDefinitions } from './definitions';
import { loadAllModules, watchModules } from './modules/loader';
import { setIo } from './events';
import { authRouter } from './routes/auth';
import { scansRouter } from './routes/scans';
import { systemsRouter } from './routes/systems';
import { definitionsRouter } from './routes/definitions';
import { modulesRouter } from './routes/modules';
import { tasksRouter } from './routes/tasks';
import { statsRouter } from './routes/stats';

// --- bootstrap ---------------------------------------------------------------
db.exec('PRAGMA foreign_keys = ON;');
seedAdmin();
seedDefinitions();
loadAllModules();
watchModules();

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'panoptes-backend', version: '0.1.0' });
});

app.use('/api/auth', authRouter);
// Everything below requires a valid JWT.
app.use('/api/stats', requireAuth, statsRouter);
app.use('/api/scans', requireAuth, scansRouter);
app.use('/api/systems', requireAuth, systemsRouter);
app.use('/api/definitions', requireAuth, definitionsRouter);
app.use('/api/modules', requireAuth, modulesRouter);
app.use('/api/tasks', requireAuth, tasksRouter);

// --- realtime ----------------------------------------------------------------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.corsOrigin } });
setIo(io);

io.on('connection', (socket) => {
  // Clients subscribe to a specific scan or task to receive its live stream.
  socket.on('subscribe:scan', (scanId: number) => socket.join(`scan:${scanId}`));
  socket.on('subscribe:task', (taskId: number) => socket.join(`task:${taskId}`));
  socket.on('unsubscribe:task', (taskId: number) => socket.leave(`task:${taskId}`));
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[panoptes] backend listening on :${config.port}`);
});

export { app, server };
