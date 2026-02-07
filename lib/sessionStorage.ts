/**
 * Session ID persistence using localStorage
 */

const SESSION_ID_KEY = 'chordpro-session-id';
const CURRENT_SONG_ID_KEY = 'chordpro-current-song-id';
const CUSTOM_SESSION_NAME_KEY = 'chordpro-custom-session-name-';

export function getStoredSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_ID_KEY);
}

export function setStoredSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function clearStoredSessionId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_ID_KEY);
}

export function getCustomSessionName(sessionId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`${CUSTOM_SESSION_NAME_KEY}${sessionId}`);
}

export function setCustomSessionName(sessionId: string, name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${CUSTOM_SESSION_NAME_KEY}${sessionId}`, name);
}

export function clearCustomSessionName(sessionId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${CUSTOM_SESSION_NAME_KEY}${sessionId}`);
}

export function getStoredCurrentSongId(sessionId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`${CURRENT_SONG_ID_KEY}-${sessionId}`);
}

export function setStoredCurrentSongId(sessionId: string, songId: string | null): void {
  if (typeof window === 'undefined') return;
  if (songId) {
    localStorage.setItem(`${CURRENT_SONG_ID_KEY}-${sessionId}`, songId);
  } else {
    localStorage.removeItem(`${CURRENT_SONG_ID_KEY}-${sessionId}`);
  }
}
