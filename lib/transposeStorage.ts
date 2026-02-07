/**
 * Transpose preference persistence using localStorage
 * Stores transpose per song (songId) within a session
 */

const TRANSPOSE_KEY = 'chordpro-transpose';

const DEFAULT_TRANSPOSE = 0; // No transposition

export function getStoredTranspose(sessionId: string | null, songId: string | null): number {
  if (typeof window === 'undefined') return DEFAULT_TRANSPOSE;
  if (!sessionId || !songId) return DEFAULT_TRANSPOSE;
  
  const key = `${TRANSPOSE_KEY}-${sessionId}-${songId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return DEFAULT_TRANSPOSE;
  
  try {
    const transpose = parseInt(stored, 10);
    // Clamp between -11 and 11 semitones
    return Math.max(-11, Math.min(11, transpose));
  } catch {
    return DEFAULT_TRANSPOSE;
  }
}

export function setStoredTranspose(sessionId: string | null, songId: string | null, transpose: number): void {
  if (typeof window === 'undefined') return;
  if (!sessionId || !songId) return;
  
  // Clamp between -11 and 11 semitones
  const clampedTranspose = Math.max(-11, Math.min(11, transpose));
  const key = `${TRANSPOSE_KEY}-${sessionId}-${songId}`;
  localStorage.setItem(key, clampedTranspose.toString());
}

export function clearStoredTranspose(sessionId: string | null, songId: string | null): void {
  if (typeof window === 'undefined') return;
  if (!sessionId || !songId) return;
  
  const key = `${TRANSPOSE_KEY}-${sessionId}-${songId}`;
  localStorage.removeItem(key);
}

// Legacy function for backward compatibility (per-session transpose)
export function getStoredTransposeLegacy(sessionId: string | null): number {
  if (typeof window === 'undefined') return DEFAULT_TRANSPOSE;
  if (!sessionId) return DEFAULT_TRANSPOSE;
  
  const key = `${TRANSPOSE_KEY}-${sessionId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return DEFAULT_TRANSPOSE;
  
  try {
    const transpose = parseInt(stored, 10);
    return Math.max(-11, Math.min(11, transpose));
  } catch {
    return DEFAULT_TRANSPOSE;
  }
}
