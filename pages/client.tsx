import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { SocketClient } from '@/lib/socket-client';
import { parseChordPro } from '@/lib/chordpro-parser';
import { useTheme } from '@/lib/useTheme';
import ThemeToggle from '@/components/ThemeToggle';
import HamburgerMenu from '@/components/HamburgerMenu';
import TextSizeControls from '@/components/TextSizeControls';
import { getStoredTextSize, setStoredTextSize } from '@/lib/textSizeStorage';
import { transposeDocument } from '@/lib/chordTransposer';
import styles from '../styles/Client.module.css';

const ChordProRenderer = dynamic(
  () => import('@/components/ChordProRenderer'),
  { ssr: false }
);

export default function ClientView() {
  const router = useRouter();
  const { session: sessionIdParam } = router.query;
  const [socketClient, setSocketClient] = useState<SocketClient | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [document, setDocument] = useState<string>('');
  const [parsedDocument, setParsedDocument] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [targetLineIndex, setTargetLineIndex] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useTheme();
  const [currentSongTitle, setCurrentSongTitle] = useState<string>('');
  const [upNextTitle, setUpNextTitle] = useState<string>('');
  const [previousSongTitle, setPreviousSongTitle] = useState<string>('');
  const [textSize, setTextSize] = useState<number>(getStoredTextSize());
  const [transpose, setTranspose] = useState<number>(0);

  useEffect(() => {
    if (!sessionIdParam || typeof sessionIdParam !== 'string') {
      return;
    }

    const client = new SocketClient();
    
    client.connect().then(() => {
      setIsConnected(true);
      // Normalize room ID (uppercase)
      const normalizedRoomId = sessionIdParam.toUpperCase().trim();
      client.joinRoom(normalizedRoomId).then((sessionInfo) => {
        console.log('Joined session, received info:', {
          sessionId: sessionInfo.sessionId,
          isMaster: sessionInfo.isMaster,
          hasDocument: !!sessionInfo.document,
          documentLength: sessionInfo.document ? sessionInfo.document.length : 0,
          scrollPosition: sessionInfo.scrollPosition,
        });
        setSessionId(sessionInfo.sessionId);
        setSocketClient(client);
        
        // Check if document exists and is not empty
        if (sessionInfo.document && typeof sessionInfo.document === 'string' && sessionInfo.document.trim().length > 0) {
          console.log('Document received on join, length:', sessionInfo.document.length);
          console.log('Document preview:', sessionInfo.document.substring(0, 200));
          setDocument(sessionInfo.document);
          try {
            const parsed = parseChordPro(sessionInfo.document);
            setParsedDocument(parsed);
            console.log('Document parsed successfully, lines:', parsed.lines.length);
          } catch (parseError) {
            console.error('Error parsing document:', parseError);
            setError('Failed to parse document');
          }
        } else {
          console.log('No document in session yet (document:', sessionInfo.document, ')');
        }
        
        if (sessionInfo.scrollPosition !== undefined) {
          setScrollPosition(sessionInfo.scrollPosition);
        }
        
        if (sessionInfo.lineIndex !== undefined) {
          setTargetLineIndex(sessionInfo.lineIndex);
        }
        
        if (sessionInfo.currentSongTitle) {
          setCurrentSongTitle(sessionInfo.currentSongTitle);
        }
        
        if (sessionInfo.upNextTitle) {
          setUpNextTitle(sessionInfo.upNextTitle);
        }
        
        if (sessionInfo.previousSongTitle) {
          setPreviousSongTitle(sessionInfo.previousSongTitle);
        }
        
        if (sessionInfo.transpose !== undefined) {
          setTranspose(sessionInfo.transpose);
        }
      }).catch((err) => {
        console.error('Failed to join session:', err);
        setError(err.message || 'Failed to join session');
      });
    }).catch((error) => {
      console.error('Failed to connect:', error);
      setError('Failed to connect to server');
    });

    // Listen for document updates
    client.onDocumentUpdate((updatedDocument) => {
      console.log('Document update received:', updatedDocument.substring(0, 100));
      setDocument(updatedDocument);
      const parsed = parseChordPro(updatedDocument);
      setParsedDocument(parsed);
      // Scroll position will be reset by the renderer when document changes
    });

    // Listen for scroll updates (pixel-based, for backward compatibility)
    client.onScrollUpdate((position) => {
      setScrollPosition(position);
    });

    // Listen for line-based scroll updates
    client.onLineScrollUpdate((lineIndex) => {
      setTargetLineIndex(lineIndex);
    });

    // Listen for current song updates
    client.onCurrentSongUpdate((songTitle) => {
      setCurrentSongTitle(songTitle);
    });

    // Listen for up next updates
    client.onUpNextUpdate((upNext) => {
      setUpNextTitle(upNext);
    });

    // Listen for previous song updates
    client.onPreviousSongUpdate((previous) => {
      setPreviousSongTitle(previous);
    });

    // Listen for content updates (including transpose)
    client.onContentUpdate((data) => {
      if (data.transpose !== undefined) {
        // Transpose is per-song, so update it when content changes
        setTranspose(data.transpose);
      }
      if (data.document !== undefined) {
        setDocument(data.document);
        const parsed = parseChordPro(data.document);
        setParsedDocument(parsed);
        // Reset transpose when document changes (new song loaded)
        // The transpose will be synced via the transpose field in the update
      }
      if (data.currentSongTitle !== undefined) {
        setCurrentSongTitle(data.currentSongTitle);
      }
      if (data.upNextTitle !== undefined) {
        setUpNextTitle(data.upNextTitle);
      }
      if (data.previousSongTitle !== undefined) {
        setPreviousSongTitle(data.previousSongTitle);
      }
    });

    // Listen for session closure
    client.onSessionClosed(() => {
      setError('Session closed by master');
    });

    return () => {
      client.disconnect();
    };
  }, [sessionIdParam]);

  const handleTextSizeIncrease = () => {
    const newSize = Math.min(2.0, textSize + 0.1);
    setTextSize(newSize);
    setStoredTextSize(newSize);
  };

  const handleTextSizeDecrease = () => {
    const newSize = Math.max(0.5, textSize - 0.1);
    setTextSize(newSize);
    setStoredTextSize(newSize);
  };

  const handleTextSizeReset = () => {
    setTextSize(1.0);
    setStoredTextSize(1.0);
  };

  if (error) {
    return (
      <div className={`${styles.container} ${theme === 'dark' ? styles.dark : ''}`}>
        <div className={styles.error}>
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => router.push('/')} className={styles.button}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${theme === 'dark' ? styles.dark : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            {previousSongTitle ? (
              <span className={styles.previousSongText}>
                <span className={styles.previousLabel}>Previous:</span> {previousSongTitle}
              </span>
            ) : (
              <span className={styles.startLabel}>START</span>
            )}
          </div>
          <div className={styles.headerCenter}>
            {currentSongTitle && (
              <span className={styles.nowPlaying}>
                <span className={styles.playingNowLabel}>Playing now:</span> {currentSongTitle}
              </span>
            )}
          </div>
          <div className={styles.headerRight}>
            {upNextTitle ? (
              <span className={styles.nextSongText}>
                <span className={styles.nextLabel}>Next up:</span> {upNextTitle}
              </span>
            ) : (
              <span className={styles.endLabel}>END</span>
            )}
          </div>
          <div className={styles.headerActions}>
            <HamburgerMenu theme={theme}>
              <h2 className={styles.menuTitle}>Menu</h2>
              {sessionId && (
                <div className={styles.menuItem}>
                  <span className={styles.menuLabel}>Session ID:</span>
                  <span className={styles.sessionId}>{sessionId}</span>
                </div>
              )}
              <div className={styles.menuItem}>
                <span className={styles.menuLabel}>Status:</span>
                <span className={isConnected ? styles.connected : styles.disconnected}>
                  {isConnected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
              {previousSongTitle && (
                <>
                  <div className={styles.menuDivider} />
                  <div className={styles.menuItem}>
                    <span className={styles.menuLabel}>Previous:</span>
                    <span className={styles.menuValue}>{previousSongTitle}</span>
                  </div>
                </>
              )}
              <div className={styles.menuDivider} />
              <div className={styles.menuItem}>
                <span className={styles.menuLabel}>Text Size:</span>
                <TextSizeControls
                  textSize={textSize}
                  onIncrease={handleTextSizeIncrease}
                  onDecrease={handleTextSizeDecrease}
                  onReset={handleTextSizeReset}
                  theme={theme}
                />
              </div>
              <div className={styles.menuDivider} />
              <div className={styles.menuItem}>
                <ThemeToggle
                  theme={theme}
                  onToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                />
              </div>
              <button
                onClick={() => router.push('/')}
                className={styles.menuButton}
              >
                Leave Session
              </button>
            </HamburgerMenu>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {parsedDocument ? (
          <ChordProRenderer
            key={currentSongTitle || 'default'}
            document={transpose !== 0 ? transposeDocument(parsedDocument, transpose) : parsedDocument}
            scrollPosition={scrollPosition}
            targetLineIndex={targetLineIndex}
            isMaster={false}
            theme={theme}
            textSize={textSize}
          />
        ) : (
          <div className={styles.emptyState}>
            <p>Waiting for master to load a file...</p>
          </div>
        )}
      </div>
    </div>
  );
}
