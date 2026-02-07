import React from 'react';
import { ChordProDocument, ChordProLine } from '@/lib/chordpro-parser';
import { Theme } from '@/lib/useTheme';
import styles from './ChordProRenderer.module.css';

interface ChordProRendererProps {
  document: ChordProDocument;
  scrollPosition?: number;
  scrollTopPercent?: number; // New: percentage-based scroll for better sync
  onScroll?: (position: number, scrollTopPercent?: number, lineIndex?: number) => void;
  onLineScroll?: (lineIndex: number) => void; // New: send line index instead of pixel position
  isMaster?: boolean;
  theme?: Theme;
  textSize?: number;
  targetLineIndex?: number; // New: line index to scroll to (for clients)
}

export default function ChordProRenderer({
  document,
  scrollPosition,
  scrollTopPercent,
  onScroll,
  onLineScroll,
  isMaster = false,
  theme = 'light',
  textSize = 1.0,
  targetLineIndex,
}: ChordProRendererProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const previousDocumentRef = React.useRef<ChordProDocument | null>(null);
  const lineRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());

  // Scroll to top only when document content actually changes (not just transpose)
  // Compare by checking if the number of lines changed or if it's a completely different document
  React.useEffect(() => {
    const documentChanged = previousDocumentRef.current === null || 
      previousDocumentRef.current.lines.length !== document.lines.length ||
      (previousDocumentRef.current.title !== document.title);
    
    if (documentChanged) {
      previousDocumentRef.current = document;
      
      // Clear line refs when document changes
      lineRefs.current.clear();
      
      // Only scroll to top if scrollPosition is not provided or is 0
      // This allows preserving scroll position during transpose-only updates
      if (containerRef.current && (scrollPosition === undefined || scrollPosition === 0)) {
        containerRef.current.scrollTop = 0;
        if (onScroll && isMaster) {
          onScroll(0);
        }
        if (onLineScroll && isMaster) {
          onLineScroll(0);
        }
      }
    } else {
      // Document didn't actually change (just transpose), update ref but don't scroll
      previousDocumentRef.current = document;
    }
  }, [document, isMaster, onScroll, onLineScroll, scrollPosition]);

  // Sync scroll position when it changes (for clients) - use percentage-based sync when available
  React.useEffect(() => {
    if (!isMaster && containerRef.current) {
      console.log('Scroll sync effect triggered:', { scrollTopPercent, scrollPosition, targetLineIndex });
      // Use requestAnimationFrame to ensure DOM is ready
      const applyScroll = () => {
        if (!containerRef.current) {
          console.log('Container ref not available');
          return;
        }
        
        // Use percentage-based sync if available (best for different screen sizes)
        if (scrollTopPercent !== undefined) {
          const scrollHeight = containerRef.current.scrollHeight;
          const clientHeight = containerRef.current.clientHeight;
          const maxScroll = scrollHeight - clientHeight;
          if (maxScroll > 0) {
            const targetScroll = (scrollTopPercent / 100) * maxScroll;
            console.log('Applying scroll via percentage:', { scrollTopPercent, targetScroll, scrollHeight, clientHeight, maxScroll });
            containerRef.current.scrollTop = targetScroll;
            return;
          }
        }
        
        // Use line-based sync if available (better for different text sizes)
        if (targetLineIndex !== undefined && lineRefs.current.has(targetLineIndex)) {
          const targetLineElement = lineRefs.current.get(targetLineIndex);
          if (targetLineElement) {
            console.log('Applying scroll via line index:', { targetLineIndex, offsetTop: targetLineElement.offsetTop });
            // Scroll the target line to the top
            containerRef.current.scrollTop = targetLineElement.offsetTop;
            return;
          }
        }
        
        // Fallback to pixel-based sync (also used for transpose preservation)
        if (scrollPosition !== undefined && scrollPosition > 0) {
          console.log('Applying scroll via position:', scrollPosition);
          containerRef.current.scrollTop = scrollPosition;
        }
      };
      
      // Try immediately, then retry after a short delay to ensure DOM is ready
      requestAnimationFrame(() => {
        applyScroll();
        // Retry after a short delay in case content is still rendering
        setTimeout(applyScroll, 50);
        // Also retry after longer delay for slow renders
        setTimeout(applyScroll, 200);
      });
    }
  }, [scrollTopPercent, targetLineIndex, scrollPosition, isMaster, document]);

  // Track scroll for master
  const handleScroll = React.useCallback(() => {
    if (isMaster && containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const scrollHeight = containerRef.current.scrollHeight;
      const clientHeight = containerRef.current.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      
      // Calculate scroll percentage (best for sync across different screen sizes)
      const scrollTopPercent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      
      // Calculate line index for better sync across text sizes
      let topLineIndex: number | undefined = undefined;
      if (lineRefs.current.size > 0) {
        let minDistance = Infinity;
        lineRefs.current.forEach((element, index) => {
          if (element) {
            const elementTop = element.offsetTop;
            const distance = Math.abs(scrollTop - elementTop);
            
            // Find the line closest to the scroll position
            if (distance < minDistance) {
              minDistance = distance;
              topLineIndex = index;
            }
          }
        });
      }
      
      // Send scroll data with percentage (primary sync method)
      if (onScroll) {
        onScroll(scrollTop, scrollTopPercent, topLineIndex);
      }
      
      // Also send line index separately (legacy support)
      if (onLineScroll && topLineIndex !== undefined) {
        onLineScroll(topLineIndex);
      }
    }
  }, [isMaster, onScroll, onLineScroll]);

  const setLineRef = React.useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) {
      lineRefs.current.set(index, element);
    } else {
      lineRefs.current.delete(index);
    }
  }, []);

  const renderLine = (line: ChordProLine, index: number) => {
    const lineRef = (el: HTMLDivElement | null) => setLineRef(index, el);
    const lineProps = { 'data-line-index': index.toString() };
    
    switch (line.type) {
      case 'empty':
        return <div key={index} ref={lineRef} {...lineProps} className={styles.emptyLine} />;

      case 'comment':
        return (
          <div key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.comment}>
            #{line.content}
          </div>
        );

      case 'directive':
        if (line.directive === 'title' && line.value) {
          return (
            <h1 key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.title}>
              {line.value}
            </h1>
          );
        }
        if (line.directive === 'subtitle' && line.value) {
          return (
            <h2 key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.subtitle}>
              {line.value}
            </h2>
          );
        }
        if (line.directive === 'start_of_chorus') {
          return (
            <div key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.sectionMarker}>
              <span className={styles.sectionLabel}>Chorus</span>
            </div>
          );
        }
        if (line.directive === 'end_of_chorus') {
          return <div key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.sectionEnd} />;
        }
        if (line.directive === 'start_of_verse') {
          return (
            <div key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.sectionMarker}>
              <span className={styles.sectionLabel}>Verse</span>
            </div>
          );
        }
        if (line.directive === 'end_of_verse') {
          return <div key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.sectionEnd} />;
        }
        if (line.directive === 'comment' && line.value) {
          return (
            <div key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.commentDirective}>
              <div className={styles.commentLine} />
              <div className={styles.commentText}>{line.value}</div>
              <div className={styles.commentLine} />
            </div>
          );
        }
        return null;

      case 'lyrics':
        return (
          <div key={index} ref={setLineRef.bind(null, index)} {...lineProps} className={styles.lyricsLine}>
            {renderLyricsWithChords(line.lyrics || '', line.chords || [])}
          </div>
        );

      default:
        return null;
    }
  };

  const renderLyricsWithChords = (
    lyrics: string,
    chords: Array<{ chord: string; position: number }>
  ) => {
    if (chords.length === 0) {
      return <div className={styles.lyricsText}>{lyrics}</div>;
    }

    // Sort chords by position
    const sortedChords = [...chords].sort((a, b) => a.position - b.position);
    
    // Calculate character width - use em units relative to lyrics font size
    // The key is that both chords and lyrics need to use the same base for em calculations
    // Since lyrics font size is 1.2rem * textSize, and we want chords aligned above,
    // we need to calculate based on the lyrics font size
    const lyricsFontSizeEm = 1.2 * textSize; // This is the base for em calculations
    const charWidthEm = 0.6; // Character width multiplier (relative to lyrics font size)
    
    return (
      <div className={styles.lineContainer}>
        <div className={styles.chordLine}>
          {sortedChords.map((chordData, index) => {
            const prevPosition = index === 0 ? 0 : sortedChords[index - 1].position;
            const spacing = chordData.position - prevPosition;
            
            // Calculate position in em units relative to lyrics font size
            const positionEm = index === 0 
              ? chordData.position * charWidthEm
              : spacing * charWidthEm;
            
            return (
              <span
                key={`chord-display-${index}`}
                className={styles.chord}
                style={{
                  marginLeft: `${positionEm}em`,
                }}
              >
                {chordData.chord}
              </span>
            );
          })}
        </div>
        <div className={styles.lyricsText}>
          {lyrics}
        </div>
      </div>
    );
  };

  // Calculate CSS variables for text size
  // Use consistent base sizes that scale together - these are the same for master and client
  const baseChordSize = 0.9; // rem
  const baseLyricsSize = 1.2; // rem
  const baseChordLineHeight = 1.5; // rem
  const baseLyricsLineHeight = 1.8; // multiplier
  
  const textSizeStyle = {
    '--text-size': textSize.toString(),
    '--chord-size': `${baseChordSize * textSize}rem`,
    '--lyrics-size': `${baseLyricsSize * textSize}rem`,
    '--chord-line-height': `${baseChordLineHeight * textSize}rem`,
    '--lyrics-line-height': `${baseLyricsLineHeight * textSize}`,
  } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${theme === 'dark' ? styles.dark : ''}`}
      data-master={isMaster ? 'true' : 'false'}
      onScroll={isMaster ? undefined : handleScroll}
      style={textSizeStyle}
    >
      <div className={styles.content}>
        {document.lines.map((line, index) => renderLine(line, index))}
        <div className={styles.bottomSpacer} />
      </div>
    </div>
  );
}
