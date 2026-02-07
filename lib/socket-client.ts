/**
 * WebSocket Client for real-time synchronization
 */

import { io, Socket } from 'socket.io-client';

export interface SessionInfo {
  sessionId: string;
  isMaster: boolean;
  masterSessionId?: string;
  document?: string;
  scrollPosition?: number;
  scrollTopPercent?: number;
  lineIndex?: number;
  currentSongTitle?: string;
  upNextTitle?: string;
  previousSongTitle?: string;
  transpose?: number;
}

export class SocketClient {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private masterSessionId: string | null = null;
  private isMaster: boolean = false;
  private connectionStatusCallbacks: Array<(status: 'connected' | 'disconnected' | 'syncing') => void> = [];

  constructor() {
    // Socket will be initialized when connecting
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use environment variable for socket URL, fallback to current origin
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL 
        || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      
      console.log('Attempting to connect to:', socketUrl);
      
      this.socket = io(socketUrl, {
        path: '/api/socket',
        transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
        reconnection: true,
        reconnectionAttempts: Infinity, // Keep trying to reconnect
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: false, // Reuse connection when possible
      });

      this.socket.on('connect', () => {
        console.log('Connected to server, socket ID:', this.socket?.id);
        this.notifyConnectionStatus('connected');
        
        // If we had a previous session, try to reconnect to it
        if (this.sessionId && this.masterSessionId) {
          this.joinSession(this.sessionId, this.masterSessionId).catch((err) => {
            console.error('Failed to reconnect to session:', err);
          });
        }
        
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        this.notifyConnectionStatus('disconnected');
        // Don't reject on initial connect error - let reconnection handle it
        if (!this.socket?.connected) {
          reject(error);
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        this.notifyConnectionStatus('disconnected');
        // Socket.io will automatically attempt to reconnect
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected after', attemptNumber, 'attempts');
        this.notifyConnectionStatus('syncing');
        // Try to rejoin session if we had one
        if (this.sessionId && this.masterSessionId) {
          this.joinSession(this.sessionId, this.masterSessionId).catch((err) => {
            console.error('Failed to reconnect to session after socket reconnect:', err);
          });
        }
      });
    });
  }

  // New unified join-session event
  joinSession(roomID: string, masterSessionId?: string): Promise<SessionInfo> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      if (!this.socket.connected) {
        reject(new Error('Socket is not connected'));
        return;
      }

      const normalizedRoomId = roomID.toUpperCase().trim();
      console.log('Joining session:', normalizedRoomId, masterSessionId ? `(master session: ${masterSessionId})` : '');
      
      this.socket.emit('join-session', normalizedRoomId, masterSessionId || null, (response: SessionInfo | { error: string }) => {
        console.log('Received join-session response:', response);
        
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
        this.masterSessionId = response.masterSessionId || null;
        resolve(response);
      });
    });
  }

  // Sync scroll - Master broadcasts scroll percentage
  syncScroll(roomID: string, scrollTopPercent: number, scrollPosition?: number, lineIndex?: number): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('sync-scroll', {
      roomID: roomID.toUpperCase().trim(),
      scrollTopPercent,
      scrollPosition,
      lineIndex,
    });
  }

  // Legacy methods for backward compatibility
  createRoom(customRoomId?: string): Promise<SessionInfo> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      if (!this.socket.connected) {
        reject(new Error('Socket is not connected'));
        return;
      }

      // Use join-session to create room (first person becomes master)
      const roomId = customRoomId ? customRoomId.toUpperCase().trim() : null;
      if (roomId) {
        this.joinSession(roomId).then(resolve).catch(reject);
      } else {
        // Generate a room ID and try to join
        const generatedId = this.generateRoomId();
        this.joinSession(generatedId).then(resolve).catch(reject);
      }
    });
  }

  private generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let roomId = '';
    const length = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < length; i++) {
      roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return roomId;
  }

  joinRoom(roomId: string): Promise<SessionInfo> {
    return this.joinSession(roomId);
  }

  reconnectToRoom(roomId: string, masterSessionId?: string): Promise<SessionInfo> {
    return this.joinSession(roomId, masterSessionId || this.masterSessionId || undefined);
  }

  joinOrCreateRoom(roomId: string): Promise<SessionInfo> {
    return this.joinSession(roomId);
  }

  // Legacy method name for backward compatibility
  createSession(customSessionId?: string): Promise<SessionInfo> {
    return this.createRoom(customSessionId);
  }

  updateDocument(document: string): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    // Use new content-change event
    this.socket.emit('content-change', {
      roomId: this.sessionId,
      document,
    });
  }

  updateContent(data: {
    document?: string;
    currentSongTitle?: string;
    upNextTitle?: string;
    previousSongTitle?: string;
    transpose?: number;
  }): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('content-change', {
      roomId: this.sessionId,
      ...data,
    });
  }

  updateScroll(scrollPosition: number): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('scroll-update', {
      roomId: this.sessionId,
      scrollPosition,
    });
  }

  updateLineScroll(lineIndex: number): void {
    if (!this.socket || !this.sessionId || !this.isMaster) {
      return;
    }

    this.socket.emit('line-scroll-update', {
      roomId: this.sessionId,
      lineIndex,
    });
  }

  onDocumentUpdate(callback: (document: string) => void): void {
    if (!this.socket) return;

    this.socket.on('document-updated', (data: { document: string }) => {
      callback(data.document);
    });

    // Also listen for new content-updated event
    this.socket.on('content-updated', (data: { document?: string }) => {
      if (data.document !== undefined) {
        callback(data.document);
      }
    });
  }

  onContentUpdate(callback: (data: {
    document?: string;
    currentSongTitle?: string;
    upNextTitle?: string;
    previousSongTitle?: string;
    transpose?: number;
  }) => void): void {
    if (!this.socket) return;

    this.socket.on('content-updated', (data) => {
      callback(data);
    });
  }

  onScrollUpdate(callback: (scrollPosition: number) => void): void {
    if (!this.socket) return;

    this.socket.on('scroll-updated', (data: { scrollPosition: number }) => {
      callback(data.scrollPosition);
    });
  }

  // Listen for new sync-scroll event
  onScrollSynced(callback: (data: { scrollTopPercent: number; scrollPosition: number; lineIndex?: number }) => void): void {
    if (!this.socket) return;

    this.socket.on('scroll-synced', (data) => {
      callback(data);
    });
  }

  onLineScrollUpdate(callback: (lineIndex: number) => void): void {
    if (!this.socket) return;

    this.socket.on('line-scroll-updated', (data: { lineIndex: number }) => {
      callback(data.lineIndex);
    });
  }

  updateCurrentSong(songTitle: string): void {
    this.updateContent({ currentSongTitle: songTitle });
  }

  updateUpNext(upNextTitle: string): void {
    this.updateContent({ upNextTitle });
  }

  updatePreviousSong(previousTitle: string): void {
    this.updateContent({ previousSongTitle: previousTitle });
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

    // Also listen for new room-closed event
    this.socket.on('room-closed', (data: { reason?: string }) => {
      console.log('Room closed:', data.reason);
      callback();
    });
  }

  // Connection status monitoring
  onConnectionStatusChange(callback: (status: 'connected' | 'disconnected' | 'syncing') => void): void {
    this.connectionStatusCallbacks.push(callback);
  }

  private notifyConnectionStatus(status: 'connected' | 'disconnected' | 'syncing'): void {
    this.connectionStatusCallbacks.forEach(callback => callback(status));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this.masterSessionId = null;
    this.isMaster = false;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getMasterSessionId(): string | null {
    return this.masterSessionId;
  }

  getIsMaster(): boolean {
    return this.isMaster;
  }
}
