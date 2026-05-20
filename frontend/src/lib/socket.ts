'use client';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket() {
  if (typeof window === 'undefined') return null;
  if (socket) return socket;
  const url =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3411';
  socket = io(url, { transports: ['websocket'], reconnection: true });
  return socket;
}
