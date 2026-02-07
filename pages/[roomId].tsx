import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { SocketClient } from '@/lib/socket-client';
import { parseChordPro } from '@/lib/chordpro-parser';
import { useTheme } from '@/lib/useTheme';
import ThemeToggle from '@/components/ThemeToggle';
import HamburgerMenu from '@/components/HamburgerMenu';
import TextSizeControls from '@/components/TextSizeControls';
import { getStoredTextSize, setStoredTextSize } from '@/lib/textSizeStorage';
import { requestWakeLock, releaseWakeLock } from '@/lib/wakeLock';
import ConnectionStatus from '@/components/ConnectionStatus';
import styles from '../styles/Client.module.css';

const ChordProRenderer = dynamic(
  () => import('@/components/ChordProRenderer'),
  { ssr: false }
);

export default function RoomView() {
  const router = useRouter();
  const { roomId } = router.query;
  const [socketClient, setSocketClient] = useState<SocketClient | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string>('');
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
  const [isMaster, setIsMaster] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'syncing'>('disconnected');
  const [scrollTopPercent, setScrollTopPercent] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!roomId || typeof roomId !== 'string') {
      return;
    }

    // Request wake lock for mobile devices
    requestWakeLock().then((success) => {
      setWakeLockActive(success);
    });

    const client = new SocketClient();
    
    // Listen for connection status changes
    client.onConnectionStatusChange((status) => {
      setConnectionStatus(status);
      setIsConnected(status === 'connected');
    });
    
    client.connect().then(() => {
      setIsConnected(true);
      setConnectionStatus('connected');
      const normalizedRoomId = roomId.toUpperCase().trim();
      
      client.joinSession(normalizedRoomId).then((sessionInfo) => {
        console.log('Joined room, received info:', {
          roomId: sessionInfo.sessionId,
          isMaster: sessionInfo.isMaster,
          hasDocument: !!sessionInfo.document,
        });
        
        setCurrentRoomId(sessionInfo.sessionId);
        setIsMaster(sessionInfo.isMaster);
        setSocketClient(client);
        
        // Check if document exists and is not empty
        if (sessionInfo.document && typeof sessionInfo.document === 'string' && sessionInfo.document.trim().length > 0) {
          setDocument(sessionInfo.document);
          try {
            const parsed = parseChordPro(sessionInfo.document);
            setParsedDocument(parsed);
          } catch (parseError) {
            console.error('Error parsing document:', parseError);
            setError('Failed to parse document');
          }
        }
        
        if (sessionInfo.scrollPosition !== undefined) {
          setScrollPosition(sessionInfo.scrollPosition);
        }
        
        if (sessionInfo.scrollTopPercent !== undefined) {
          setScrollTopPercent(sessionInfo.scrollTopPercent);
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
      }).catch((err) => {
        console.error('Failed to join room:', err);
        setError(err.message || 'Failed to join room');
      });
    }).catch((error) => {
      console.error('Failed to connect:', error);
      setError('Failed to connect to server');
    });

    // Listen for document updates
    client.onDocumentUpdate((updatedDocument) => {
      setDocument(updatedDocument);
      const parsed = parseChordPro(updatedDocument);
      setParsedDocument(parsed);
    });

    // Listen for content updates (new unified event)
    client.onContentUpdate((data) => {
      if (data.document !== undefined) {
        setDocument(data.document);
        try {
          const parsed = parseChordPro(data.document);
          setParsedDocument(parsed);
        } catch (parseError) {
          console.error('Error parsing document:', parseError);
        }
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

    // Listen for scroll updates (new sync-scroll event - primary method)
    client.onScrollSynced((data) => {
      if (data.scrollTopPercent !== undefined) {
        setScrollTopPercent(data.scrollTopPercent);
      }
      if (data.scrollPosition !== undefined) {
        setScrollPosition(data.scrollPosition);
      }
      if (data.lineIndex !== undefined) {
        setTargetLineIndex(data.lineIndex);
      }
    });

    // Listen for scroll updates (legacy)
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

    // Listen for room closure
    client.onSessionClosed(() => {
      setError('Room closed by master');
    });

    // Cleanup
    return () => {
      releaseWakeLock();
      client.disconnect();
    };
  }, [roomId]);

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

  const handleShareRoom = async () => {
    const url = `${window.location.origin}/${currentRoomId}`;
    
    if (navigator.share) {
      // Use native share sheet on mobile
      try {
        await navigator.share({
          title: 'Join ChordPro Session',
          text: `Join my ChordPro session: ${currentRoomId}`,
          url: url,
        });
      } catch (err) {
        // User cancelled or error - fallback to clipboard
        navigator.clipboard.writeText(url);
        alert(`Room URL copied to clipboard: ${url}`);
      }
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(url);
      alert(`Room URL copied to clipboard: ${url}`);
    }
  };

  const handleToggleMode = () => {
    if (isMaster) {
      // Switch to client mode - just reload as client
      router.push(`/${currentRoomId}`);
    } else {
      // Switch to master mode
      router.push(`/master?room=${currentRoomId}`);
    }
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
      <ConnectionStatus status={connectionStatus} theme={theme} />
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
              {currentRoomId && (
                <div className={styles.menuItem}>
                  <span className={styles.menuLabel}>Room ID:</span>
                  <div className={styles.menuSessionId}>
                    <span className={styles.sessionId}>{currentRoomId}</span>
                    <button onClick={handleShareRoom} className={styles.copyButton}>
                      Share
                    </button>
                  </div>
                </div>
              )}
              <div className={styles.menuItem}>
                <span className={styles.menuLabel}>Mode:</span>
                <span className={styles.menuValue}>{isMaster ? 'Master' : 'Client'}</span>
                <button onClick={handleToggleMode} className={styles.menuButton} style={{ marginTop: '0.5rem' }}>
                  Switch to {isMaster ? 'Client' : 'Master'}
                </button>
              </div>
              <div className={styles.menuItem}>
                <span className={styles.menuLabel}>Status:</span>
                <span className={isConnected ? styles.connected : styles.disconnected}>
                  {isConnected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
              {wakeLockActive && (
                <div className={styles.menuItem}>
                  <span className={styles.menuLabel}>Wake Lock:</span>
                  <span className={styles.connected}>● Active</span>
                </div>
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
                Back to Home
              </button>
            </HamburgerMenu>
          </div>
        </div>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.content}>
          {parsedDocument ? (
            <ChordProRenderer
              key={currentSongTitle || 'default'}
              document={parsedDocument}
              scrollPosition={scrollPosition}
              scrollTopPercent={scrollTopPercent}
              targetLineIndex={targetLineIndex}
              isMaster={isMaster}
              theme={theme}
              textSize={textSize}
            />
          ) : (
            <div className={styles.emptyState}>
              <p>{isMaster ? 'Upload a ChordPro file to get started' : 'Waiting for master to load a file...'}</p>
              <p className={styles.emptyStateHint}>
                {isMaster ? 'Supported formats: .cho, .crd, .chopro, .chordpro, .txt' : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
