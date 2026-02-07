/**
 * Text size preference persistence using localStorage
 */

const TEXT_SIZE_KEY = 'chordpro-text-size';

const DEFAULT_TEXT_SIZE = 1.0; // Base multiplier (100%)

export function getStoredTextSize(): number {
  if (typeof window === 'undefined') return DEFAULT_TEXT_SIZE;
  const stored = localStorage.getItem(TEXT_SIZE_KEY);
  if (!stored) return DEFAULT_TEXT_SIZE;
  try {
    const size = parseFloat(stored);
    // Clamp between 0.5 and 2.0 (50% to 200%)
    return Math.max(0.5, Math.min(2.0, size));
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

export function setStoredTextSize(size: number): void {
  if (typeof window === 'undefined') return;
  // Clamp between 0.5 and 2.0
  const clampedSize = Math.max(0.5, Math.min(2.0, size));
  localStorage.setItem(TEXT_SIZE_KEY, clampedSize.toString());
}
