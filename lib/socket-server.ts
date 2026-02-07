/**
 * WebSocket Server for real-time synchronization
 * This runs as a Next.js API route handler
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

interface SessionData {
  masterId: string;
  document: string;
  scrollPosition: number;
  clients: Set<string>;
}

const sessions = new Map<string, SessionData>();

export function initializeSocketServer(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Create a new session
    socket.on('create-session', (callback) => {
      const sessionId = generateSessionId();
      sessions.set(sessionId, {
        masterId: socket.id,
        document: '',
        scrollPosition: 0,
        clients: new Set([socket.id]),
      });
      
      socket.join(sessionId);
      console.log(`Session created: ${sessionId} by ${socket.id}`);
      
      if (callback) {
        callback({ sessionId, isMaster: true });
      }
    });

    // Join an existing session
    socket.on('join-session', (sessionId: string, callback) => {
      const session = sessions.get(sessionId);
      
      if (!session) {
        if (callback) {
          callback({ error: 'Session not found' });
        }
        return;
      }

      socket.join(sessionId);
      session.clients.add(socket.id);
      
      console.log(`Client ${socket.id} joined session ${sessionId}`);
      
      if (callback) {
        callback({
          sessionId,
          isMaster: session.masterId === socket.id,
          document: session.document,
          scrollPosition: session.scrollPosition,
        });
      }
    });

    // Master updates document
    socket.on('update-document', (data: { sessionId: string; document: string }) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        session.document = data.document;
        socket.to(data.sessionId).emit('document-updated', {
          document: data.document,
        });
      }
    });

    // Master updates scroll position
    socket.on('update-scroll', (data: { sessionId: string; scrollPosition: number }) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        session.scrollPosition = data.scrollPosition;
        socket.to(data.sessionId).emit('scroll-updated', {
          scrollPosition: data.scrollPosition,
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      // Remove client from all sessions
      for (const [sessionId, session] of sessions.entries()) {
        if (session.clients.has(socket.id)) {
          session.clients.delete(socket.id);
          
          // If master disconnected, close session
          if (session.masterId === socket.id) {
            io.to(sessionId).emit('session-closed');
            sessions.delete(sessionId);
            console.log(`Session ${sessionId} closed (master disconnected)`);
          }
        }
      }
    });
  });

  return io;
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}
