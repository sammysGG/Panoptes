'use client';

import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

// Single shared Socket.IO connection for live scan progress and task output.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, { transports: ['websocket', 'polling'] });
  }
  return socket;
}
