const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const sessions = new Map();

// Word lists for easy-to-communicate session IDs
const firstWords = [
  'blue', 'red', 'green', 'yellow', 'black', 'white', 'purple', 'orange',
  'big', 'small', 'fast', 'slow', 'hot', 'cold', 'loud', 'quiet',
  'rock', 'jazz', 'blues', 'folk', 'pop', 'metal', 'punk', 'soul',
  'star', 'moon', 'sun', 'wave', 'fire', 'wind', 'rain', 'snow',
  'lion', 'tiger', 'eagle', 'shark', 'wolf', 'bear', 'hawk', 'fox'
];

const secondWords = [
  'guitar', 'piano', 'drums', 'bass', 'voice', 'violin', 'trumpet', 'sax',
  'river', 'ocean', 'mountain', 'valley', 'forest', 'desert', 'island', 'beach',
  'apple', 'banana', 'cherry', 'grape', 'lemon', 'orange', 'peach', 'berry',
  'house', 'castle', 'tower', 'bridge', 'temple', 'palace', 'cabin', 'lodge',
  'dancer', 'singer', 'player', 'master', 'hero', 'king', 'queen', 'star'
];

function generateSessionId() {
  const firstWord = firstWords[Math.floor(Math.random() * firstWords.length)];
  const secondWord = secondWords[Math.floor(Math.random() * secondWords.length)];
  return `${firstWord}-${secondWord}`;
}

// Initialize session data structure
function createSession(masterId) {
  return {
    masterId,
    document: '',
    scrollPosition: 0,
    lineIndex: 0,
    currentSongTitle: '',
    upNextTitle: '',
    previousSongTitle: '',
    clients: new Set([masterId]),
  };
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer, {
    path: '/api/socket',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Create a new session
    socket.on('create-session', (customSessionId, callback) => {
      // Handle both old format (callback as second arg) and new format (customSessionId, callback)
      let actualCustomId = null;
      let actualCallback = callback;
      
      if (typeof customSessionId === 'function') {
        // Old format: no custom ID provided
        actualCallback = customSessionId;
      } else {
        // New format: custom ID provided
        actualCustomId = customSessionId ? customSessionId.toLowerCase().trim() : null;
      }
      
      console.log(`create-session event received from ${socket.id}`, actualCustomId ? `with custom ID: ${actualCustomId}` : '');
      
      let sessionId;
      
      if (actualCustomId) {
        // Check if session already exists
        if (sessions.has(actualCustomId)) {
          console.log(`Session ${actualCustomId} already exists`);
          if (actualCallback && typeof actualCallback === 'function') {
            actualCallback({ error: 'Session ID already exists' });
          }
          return;
        }
        sessionId = actualCustomId;
      } else {
        // Generate new session ID
        sessionId = generateSessionId();
      }
      
      sessions.set(sessionId, createSession(socket.id));
      
      socket.join(sessionId);
      console.log(`Session created: ${sessionId} by ${socket.id}`);
      console.log('Total sessions:', sessions.size);
      
      if (actualCallback && typeof actualCallback === 'function') {
        actualCallback({ sessionId, isMaster: true });
      } else {
        console.error('Callback is not a function:', typeof actualCallback);
      }
    });

    // Join an existing session
    socket.on('join-session', (sessionId, callback) => {
      const session = sessions.get(sessionId);
      
      if (!session) {
        console.log(`Session ${sessionId} not found`);
        if (callback && typeof callback === 'function') {
          callback({ error: 'Session not found' });
        }
        return;
      }

      socket.join(sessionId);
      session.clients.add(socket.id);
      
      console.log(`Client ${socket.id} joined session ${sessionId}`);
      console.log(`Session document length: ${session.document ? session.document.length : 0}`);
      console.log(`Session document preview: ${session.document ? session.document.substring(0, 100) : 'empty'}`);
      
      if (callback && typeof callback === 'function') {
        callback({
          sessionId,
          isMaster: session.masterId === socket.id,
          document: session.document || '',
          scrollPosition: session.scrollPosition,
          lineIndex: session.lineIndex !== undefined ? session.lineIndex : 0,
          currentSongTitle: session.currentSongTitle || '',
          upNextTitle: session.upNextTitle || '',
          previousSongTitle: session.previousSongTitle || '',
        });
      }
    });

    // Master updates document
    socket.on('update-document', (data) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        console.log(`Master ${socket.id} updating document for session ${data.sessionId}`);
        console.log(`Document length: ${data.document ? data.document.length : 0}`);
        session.document = data.document;
        socket.to(data.sessionId).emit('document-updated', {
          document: data.document,
        });
        console.log(`Document update broadcasted to ${session.clients.size - 1} clients`);
      } else {
        console.log(`Document update rejected - session: ${!!session}, isMaster: ${session && session.masterId === socket.id}`);
      }
    });

    // Master updates scroll position
    socket.on('update-scroll', (data) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        session.scrollPosition = data.scrollPosition;
        socket.to(data.sessionId).emit('scroll-updated', {
          scrollPosition: data.scrollPosition,
        });
      }
    });

    // Master updates line-based scroll position
    socket.on('update-line-scroll', (data) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        session.lineIndex = data.lineIndex;
        socket.to(data.sessionId).emit('line-scroll-updated', {
          lineIndex: data.lineIndex,
        });
      }
    });

    // Master updates current song title
    socket.on('update-current-song', (data) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        session.currentSongTitle = data.songTitle;
        socket.to(data.sessionId).emit('current-song-updated', {
          songTitle: data.songTitle,
        });
      }
    });

    // Master updates up next title
    socket.on('update-up-next', (data) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        session.upNextTitle = data.upNextTitle;
        socket.to(data.sessionId).emit('up-next-updated', {
          upNextTitle: data.upNextTitle,
        });
      }
    });

    // Master updates previous song title
    socket.on('update-previous-song', (data) => {
      const session = sessions.get(data.sessionId);
      
      if (session && session.masterId === socket.id) {
        session.previousSongTitle = data.previousTitle;
        socket.to(data.sessionId).emit('previous-song-updated', {
          previousTitle: data.previousTitle,
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

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
