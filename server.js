const express = require('express');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const PORT = process.env.PORT || 3000;

const app = next({ dev, hostname, port: PORT });
const handle = app.getRequestHandler();

// Room data storage (in production, consider Redis or database)
const rooms = new Map();
// Track master session IDs for sticky master functionality
const masterSessions = new Map(); // roomId -> masterSessionId

// Generate 4-6 character room ID
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0, O, I, 1)
  let roomId = '';
  const length = 4 + Math.floor(Math.random() * 3); // 4-6 characters
  
  for (let i = 0; i < length; i++) {
    roomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return roomId;
}

// Initialize room data structure
function createRoom(masterSocketId, roomId, masterSessionId = null) {
  return {
    roomId,
    masterSocketId,
    masterSessionId: masterSessionId || `master-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    document: '',
    scrollPosition: 0,
    scrollTopPercent: 0, // Percentage-based scroll for better sync
    lineIndex: 0,
    currentSongTitle: '',
    upNextTitle: '',
    previousSongTitle: '',
    transpose: 0, // Transpose value in semitones
    createdAt: Date.now(),
  };
}

app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);

  // Socket.io server with CORS and connection recovery for cloud deployment
  const io = new Server(httpServer, {
    path: '/api/socket',
    cors: {
      origin: dev 
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : ['https://chordpro.link', 'https://www.chordpro.link'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'], // Support both for better connectivity
    connectionStateRecovery: {
      // Enable connection state recovery for mobile signal drops
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  // Express routes
  server.all('*', async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join session - unified event for both master and client
    socket.on('join-session', (roomID, masterSessionId, callback) => {
      if (!roomID || typeof roomID !== 'string') {
        if (callback) callback({ error: 'Invalid room ID' });
        return;
      }

      const normalizedRoomId = roomID.toUpperCase().trim();
      let room = rooms.get(normalizedRoomId);
      let isMaster = false;

      if (!room) {
        // Room doesn't exist - first person to join becomes master
        const newMasterSessionId = masterSessionId || `master-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        room = createRoom(socket.id, normalizedRoomId, newMasterSessionId);
        rooms.set(normalizedRoomId, room);
        masterSessions.set(normalizedRoomId, newMasterSessionId);
        isMaster = true;
        console.log(`Room created: ${normalizedRoomId} by master ${socket.id} (session: ${newMasterSessionId})`);
      } else {
        // Room exists - check if this is the master reconnecting
        if (masterSessionId && masterSessionId === room.masterSessionId) {
          // Master is reconnecting - restore their control
          room.masterSocketId = socket.id;
          isMaster = true;
          console.log(`Master reconnected to room ${normalizedRoomId} (session: ${masterSessionId})`);
        } else {
          // Regular client joining
          isMaster = false;
          console.log(`Client ${socket.id} joined room ${normalizedRoomId}`);
        }
      }

      // Join the socket room
      socket.join(normalizedRoomId);

      if (callback) {
        callback({
          sessionId: normalizedRoomId, // Use sessionId to match client interface
          roomId: normalizedRoomId, // Keep roomId for backward compatibility
          isMaster,
          masterSessionId: room.masterSessionId,
          document: room.document || '',
          scrollPosition: room.scrollPosition,
          scrollTopPercent: room.scrollTopPercent,
          lineIndex: room.lineIndex || 0,
          currentSongTitle: room.currentSongTitle || '',
          upNextTitle: room.upNextTitle || '',
          previousSongTitle: room.previousSongTitle || '',
          transpose: room.transpose || 0,
        });
      }
    });

    // Sync scroll - Master broadcasts scroll percentage to room
    socket.on('sync-scroll', (data) => {
      const { roomID, scrollTopPercent, scrollPosition, lineIndex } = data;
      console.log('Server received sync-scroll:', { roomID, scrollTopPercent, scrollPosition, lineIndex, socketId: socket.id });
      const room = rooms.get(roomID);
      
      if (!room) {
        console.log(`Room ${roomID} not found for sync-scroll`);
        return;
      }

      // Only master can sync scroll
      if (room.masterSocketId === socket.id) {
        room.scrollTopPercent = scrollTopPercent !== undefined ? scrollTopPercent : 0;
        room.scrollPosition = scrollPosition !== undefined ? scrollPosition : 0;
        if (lineIndex !== undefined) {
          room.lineIndex = lineIndex;
        } else {
          room.lineIndex = undefined;
        }
        
        const broadcastData = {
          scrollTopPercent: room.scrollTopPercent,
          scrollPosition: room.scrollPosition,
          lineIndex: room.lineIndex,
        };
        
        console.log('Server broadcasting scroll-synced:', broadcastData);
        
        // Broadcast to all clients in the room (excluding sender)
        socket.to(roomID).emit('scroll-synced', broadcastData);
        
        console.log(`Scroll synced in room ${roomID}: ${scrollTopPercent}%`);
      } else {
        console.log(`Non-master ${socket.id} attempted to sync scroll in room ${roomID}`);
      }
    });

    // Master updates document/content (legacy support)
    socket.on('content-change', (data) => {
      const room = rooms.get(data.roomId);
      
      if (room && room.masterSocketId === socket.id) {
        room.document = data.document || '';
        room.currentSongTitle = data.currentSongTitle || '';
        room.upNextTitle = data.upNextTitle || '';
        room.previousSongTitle = data.previousSongTitle || '';
        if (data.transpose !== undefined) {
          room.transpose = data.transpose;
        }
        
        // Broadcast to all clients in the room (excluding sender)
        socket.to(data.roomId).emit('content-updated', {
          document: room.document,
          currentSongTitle: room.currentSongTitle,
          upNextTitle: room.upNextTitle,
          previousSongTitle: room.previousSongTitle,
          transpose: room.transpose || 0,
        });
        
        console.log(`Content updated in room ${data.roomId}`);
      }
    });

    // Master updates scroll position (legacy support)
    socket.on('scroll-update', (data) => {
      const room = rooms.get(data.roomId);
      
      if (room && room.masterSocketId === socket.id) {
        room.scrollPosition = data.scrollPosition;
        
        // Broadcast to all clients in the room
        socket.to(data.roomId).emit('scroll-updated', {
          scrollPosition: data.scrollPosition,
        });
      }
    });

    // Master updates line-based scroll position (legacy support)
    socket.on('line-scroll-update', (data) => {
      const room = rooms.get(data.roomId);
      
      if (room && room.masterSocketId === socket.id) {
        room.lineIndex = data.lineIndex;
        
        // Broadcast to all clients in the room
        socket.to(data.roomId).emit('line-scroll-updated', {
          lineIndex: data.lineIndex,
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('Client disconnected:', socket.id, reason);
      
      // Find rooms where this socket was master
      for (const [roomId, room] of rooms.entries()) {
        if (room.masterSocketId === socket.id) {
          // Master disconnected - but don't delete room immediately
          // Wait for reconnection (sticky master)
          console.log(`Master ${socket.id} disconnected from room ${roomId}, waiting for reconnection...`);
          // Room stays active, master can reconnect with their session ID
        }
      }
    });

    // Handle reconnection (legacy support)
    socket.on('reconnect-room', (roomId, masterSessionId, callback) => {
      const normalizedRoomId = roomId.toUpperCase().trim();
      const room = rooms.get(normalizedRoomId);
      
      if (room) {
        // Check if this is the master reconnecting
        if (masterSessionId && masterSessionId === room.masterSessionId) {
          room.masterSocketId = socket.id;
          console.log(`Master reconnected to room ${normalizedRoomId}`);
        }
        
        socket.join(normalizedRoomId);
        console.log(`Client ${socket.id} reconnected to room ${normalizedRoomId}`);
        
        if (callback) {
          callback({
            sessionId: normalizedRoomId, // Use sessionId to match client interface
            roomId: normalizedRoomId, // Keep roomId for backward compatibility
            isMaster: room.masterSocketId === socket.id,
            masterSessionId: room.masterSessionId,
            document: room.document || '',
            scrollPosition: room.scrollPosition,
            scrollTopPercent: room.scrollTopPercent,
            lineIndex: room.lineIndex || 0,
            currentSongTitle: room.currentSongTitle || '',
            upNextTitle: room.upNextTitle || '',
            previousSongTitle: room.previousSongTitle || '',
            transpose: room.transpose || 0,
          });
        }
      } else {
        if (callback) callback({ error: 'Room not found' });
      }
    });
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(PORT, '0.0.0.0', () => {
      console.log(`> Ready on http://0.0.0.0:${PORT}`);
      console.log(`> Environment: ${dev ? 'development' : 'production'}`);
    });
});
