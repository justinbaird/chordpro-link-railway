/**
 * WebSocket Client for real-time synchronization
 */

import { io, Socket } from 'socket.io-client';

export interface SessionInfo {
  sessionId: string;
  isMaster: boolean;
  document?: string;
  scrollPosition?: number;
  lineIndex?: number;
  currentSongTitle?: string;
  upNextTitle?: string;
  previousSongTitle?: string;
}

export class SocketClient {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private isMaster: boolean = false;

  constructor() {
    // Socket will be initialized when connecting
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socketUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : 'http://localhost:3000';
      
      console.log('Attempting to connect to:', socketUrl);
      
      this.socket = io(socketUrl, {
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('Connected to server, socket ID:', this.socket?.id);
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
      });
    });
  }

  createSession(customSessionId?: string): Promise<SessionInfo> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      if (!this.socket.connected) {
        reject(new Error('Socket is not connected'));
        return;
      }

      console.log('Emitting create-session event', customSessionId ? `with custom ID: ${customSessionId}` : '');
      
      this.socket.emit('create-session', customSessionId || null, (response: SessionInfo | { error: string }) => {
        console.log('Received create-session response:', response);
        
        if (!response) {
          reject(new Error('No response from server'));
          return;
        }
        
        if ('error' in response) {
          reject(new Error(response.error));
          return;
        }

        this.sessionId = response.sessionId;
        this.isMaster = response.isMaster;
        resolve(response);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.sessionId) {
          reject(new Error('Session creation timeout'));
        }
      }, 5000);
    });
  }

  joinSession(sessionId: string): Promise<SessionInfo> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      this.socket.emit('join-session', sessionId, (response: SessionInfo | { error: string }) => {
        if ('error' in response) {
          reject(new Error(response.error));
          return;
        }

        this.sessionId = response.sessionId;
        this.isMaster = response.isMaster;
        resolve(response);
      });
    });
  }

  joinOrCreateSession(sessionId: string): Promise<SessionInfo> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      // Try to join existing session first
      this.socket.emit('join-session', sessionId, (response: SessionInfo | { error: string }) => {
        if ('error' in response) {
          // Session doesn't exist, create a new one
          console.log('Session not found, creating new session');
          this.createSession().then(resolve).catch(reject);
          return;
        }

        this.sessionId = response.sessionId;
        this.isMaster = response.isMaster;
        resolve(response);
      });
    });
  }

  updateDocument(document: string): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('update-document', {
      sessionId: this.sessionId,
      document,
    });
  }

  updateScroll(scrollPosition: number): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('update-scroll', {
      sessionId: this.sessionId,
      scrollPosition,
    });
  }

  updateLineScroll(lineIndex: number): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('update-line-scroll', {
      sessionId: this.sessionId,
      lineIndex,
    });
  }

  onDocumentUpdate(callback: (document: string) => void): void {
    if (!this.socket) return;

    this.socket.on('document-updated', (data: { document: string }) => {
      callback(data.document);
    });
  }

  onScrollUpdate(callback: (scrollPosition: number) => void): void {
    if (!this.socket) return;

    this.socket.on('scroll-updated', (data: { scrollPosition: number }) => {
      callback(data.scrollPosition);
    });
  }

  onLineScrollUpdate(callback: (lineIndex: number) => void): void {
    if (!this.socket) return;

    this.socket.on('line-scroll-updated', (data: { lineIndex: number }) => {
      callback(data.lineIndex);
    });
  }

  updateCurrentSong(songTitle: string): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('update-current-song', {
      sessionId: this.sessionId,
      songTitle,
    });
  }

  updateUpNext(upNextTitle: string): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('update-up-next', {
      sessionId: this.sessionId,
      upNextTitle,
    });
  }

  updatePreviousSong(previousTitle: string): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('update-previous-song', {
      sessionId: this.sessionId,
      previousTitle,
    });
  }

  onCurrentSongUpdate(callback: (songTitle: string) => void): void {
    if (!this.socket) return;

    this.socket.on('current-song-updated', (data: { songTitle: string }) => {
      callback(data.songTitle);
    });
  }

  onUpNextUpdate(callback: (upNextTitle: string) => void): void {
    if (!this.socket) return;

    this.socket.on('up-next-updated', (data: { upNextTitle: string }) => {
      callback(data.upNextTitle);
    });
  }

  onPreviousSongUpdate(callback: (previousTitle: string) => void): void {
    if (!this.socket) return;

    this.socket.on('previous-song-updated', (data: { previousTitle: string }) => {
      callback(data.previousTitle);
    });
  }

  onSessionClosed(callback: () => void): void {
    if (!this.socket) return;

    this.socket.on('session-closed', () => {
      callback();
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this.isMaster = false;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getIsMaster(): boolean {
    return this.isMaster;
  }
}
