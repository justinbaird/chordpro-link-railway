/**
 * Setlist persistence using localStorage for metadata, IndexedDB for file contents
 * Only stores metadata (id, filename, title) in localStorage to avoid size limits
 */

export interface SetlistItem {
  id: string;
  filename: string;
  title: string;
  content: string; // This will be loaded from IndexedDB when needed
}

interface SetlistMetadata {
  id: string;
  filename: string;
  title: string;
}

const SETLIST_PREFIX = 'chordpro-setlist-';

export function getStoredSetlist(sessionId: string): SetlistMetadata[] | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${SETLIST_PREFIX}${sessionId}`);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setStoredSetlist(sessionId: string, setlist: SetlistItem[]): void {
  if (typeof window === 'undefined') return;
  // Store only metadata, not content (content is in IndexedDB)
  const metadata: SetlistMetadata[] = setlist.map(({ id, filename, title }) => ({
    id,
    filename,
    title,
  }));
  localStorage.setItem(`${SETLIST_PREFIX}${sessionId}`, JSON.stringify(metadata));
}

export function clearStoredSetlist(sessionId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${SETLIST_PREFIX}${sessionId}`);
}
