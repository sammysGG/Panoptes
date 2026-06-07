import { Server } from 'socket.io';
import { ScanProgress } from './scanner';
import { TaskLogEvent, TaskStatusEvent } from './modules/runner';

// Thin wrapper around the Socket.IO server so routes/services can emit live
// scan progress and task output without importing the HTTP server directly.
let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function emitScan(p: ScanProgress): void {
  io?.to(`scan:${p.scanId}`).emit('scan:progress', p);
  io?.emit('scan:any', p);
}

export function emitTaskLog(e: TaskLogEvent): void {
  io?.to(`task:${e.taskId}`).emit('task:log', e);
}

export function emitTaskStatus(e: TaskStatusEvent): void {
  io?.to(`task:${e.taskId}`).emit('task:status', e);
  io?.emit('task:any', e);
}
