/**
 * ChordPro Parser
 * Parses ChordPro format text files into a structured format
 */

export interface ChordProLine {
  type: 'lyrics' | 'directive' | 'comment' | 'empty';
  content?: string;
  directive?: string;
  value?: string;
  chords?: Array<{ chord: string; position: number }>;
  lyrics?: string;
}

export interface ChordProDocument {
  title?: string;
  lines: ChordProLine[];
  metadata: Record<string, string>;
  transpose?: number; // Transpose value from {transpose: value} directive
  key?: string; // Key from {key: X} directive (e.g., "C", "Am", "D")
}

/**
 * Parse a ChordPro format string into a structured document
 */
export function parseChordPro(content: string): ChordProDocument {
  const lines = content.split('\n');
  const document: ChordProDocument = {
    lines: [],
    metadata: {},
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line
    if (trimmed === '') {
      document.lines.push({ type: 'empty' });
      continue;
    }

    // Comment (starts with #)
    if (trimmed.startsWith('#')) {
      document.lines.push({
        type: 'comment',
        content: trimmed.substring(1).trim(),
      });
      continue;
    }

    // Directive (starts and ends with {})
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const directiveContent = trimmed.slice(1, -1);
      const colonIndex = directiveContent.indexOf(':');
      
      if (colonIndex > 0) {
        const directive = directiveContent.substring(0, colonIndex).trim();
        const value = directiveContent.substring(colonIndex + 1).trim();
        
        // Handle short form directives
        const directiveMap: Record<string, string> = {
          't': 'title',
          'subtitle': 'subtitle',
          'st': 'subtitle',
          'c': 'comment',
          'comment': 'comment',
        };
        
        const fullDirective = directiveMap[directive] || directive;
        
        if (fullDirective === 'title') {
          document.title = value;
        }
        
        // Handle transpose directive
        if (fullDirective === 'transpose') {
          const transposeValue = parseInt(value, 10);
          if (!isNaN(transposeValue)) {
            document.transpose = transposeValue;
          }
        }
        
        // Handle key directive
        if (fullDirective === 'key') {
          document.key = value;
        }
        
        document.metadata[fullDirective] = value;
        
        document.lines.push({
          type: 'directive',
          directive: fullDirective,
          value,
        });
      } else {
        // Directive without value (like {start_of_chorus})
        const directive = directiveContent.trim();
        document.lines.push({
          type: 'directive',
          directive,
        });
      }
      continue;
    }

    // Lyrics line with chords
    const parsed = parseLyricsLine(trimmed);
    document.lines.push({
      type: 'lyrics',
      chords: parsed.chords,
      lyrics: parsed.lyrics,
    });
  }

  return document;
}

/**
 * Parse a line containing lyrics and chords
 * Example: "Swing [D]low, sweet [G]chari[D]ot"
 */
function parseLyricsLine(line: string): {
  chords: Array<{ chord: string; position: number }>;
  lyrics: string;
} {
  const chords: Array<{ chord: string; position: number }> = [];
  let lyrics = '';
  let position = 0;
  
  // Remove chords from the line and track their positions
  const chordRegex = /\[([^\]]+)\]/g;
  let match;
  let lastIndex = 0;
  
  while ((match = chordRegex.exec(line)) !== null) {
    const chord = match[1];
    const chordStart = match.index;
    const chordEnd = match.index + match[0].length;
    
    // Add text before the chord
    lyrics += line.substring(lastIndex, chordStart);
    
    // Track chord position relative to lyrics
    chords.push({
      chord,
      position: lyrics.length,
    });
    
    lastIndex = chordEnd;
  }
  
  // Add remaining text
  lyrics += line.substring(lastIndex);
  
  return { chords, lyrics };
}
