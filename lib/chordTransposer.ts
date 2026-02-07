/**
 * Chord Transposition Utility
 * Uses chord-transposer library to transpose ChordPro documents
 */

import { Transposer } from 'chord-transposer';
import { ChordProDocument, ChordProLine } from './chordpro-parser';

/**
 * Transpose a single chord string by semitones
 * @param chord - Chord string (e.g., "C", "Am", "Fmaj7")
 * @param semitones - Number of semitones to transpose (positive = up, negative = down)
 * @returns Transposed chord string
 */
export function transposeChord(chord: string, semitones: number): string {
  if (!chord || semitones === 0) {
    return chord;
  }

  try {
    if (semitones > 0) {
      return Transposer.transpose(chord).up(semitones).toString();
    } else {
      return Transposer.transpose(chord).down(Math.abs(semitones)).toString();
    }
  } catch (error) {
    console.warn(`Failed to transpose chord "${chord}":`, error);
    return chord; // Return original chord if transposition fails
  }
}

/**
 * Transpose all chords in a ChordPro document
 * @param document - The ChordPro document to transpose
 * @param semitones - Number of semitones to transpose (positive = up, negative = down)
 * @returns New ChordPro document with transposed chords
 */
export function transposeDocument(document: ChordProDocument, semitones: number): ChordProDocument {
  if (semitones === 0) {
    return document;
  }

  const transposedDocument: ChordProDocument = {
    ...document,
    lines: document.lines.map((line) => transposeLine(line, semitones)),
  };

  return transposedDocument;
}

/**
 * Transpose chords in a single line
 */
function transposeLine(line: ChordProLine, semitones: number): ChordProLine {
  if (line.type !== 'lyrics' || !line.chords || line.chords.length === 0) {
    return line;
  }

  return {
    ...line,
    chords: line.chords.map((chordData) => ({
      ...chordData,
      chord: transposeChord(chordData.chord, semitones),
    })),
  };
}

/**
 * Get the key name from semitones offset
 * @param semitones - Number of semitones from C (0 = C, 1 = C#, 2 = D, etc.)
 * @returns Key name (e.g., "C", "C#", "D", "Db")
 */
export function getKeyName(semitones: number): string {
  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const normalizedSemitones = ((semitones % 12) + 12) % 12; // Handle negative values
  return keys[normalizedSemitones];
}

/**
 * Parse key name to semitones offset from C
 * @param keyName - Key name (e.g., "C", "C#", "Db", "D", "Am", "Dm")
 * @returns Semitones offset from C, or 0 if invalid
 */
export function parseKeyToSemitones(keyName: string): number {
  const keyMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };

  let normalizedKey = keyName.trim().replace(/^key:/i, '').trim();
  
  // Extract root note from chord names (e.g., "Am" -> "A", "Dm7" -> "D", "C#m" -> "C#")
  // Match note name (with optional sharp/flat) at the start
  const rootMatch = normalizedKey.match(/^([A-G][#b]?)/i);
  if (rootMatch) {
    normalizedKey = rootMatch[1];
  }
  
  // Normalize to uppercase for lookup
  normalizedKey = normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
  
  return keyMap[normalizedKey] ?? 0;
}
