import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { SocketClient } from '@/lib/socket-client';
import { parseChordPro } from '@/lib/chordpro-parser';
import { useTheme } from '@/lib/useTheme';
import ThemeToggle from '@/components/ThemeToggle';
import { SetlistItem } from '@/components/SetlistSidebar';
import HamburgerMenu from '@/components/HamburgerMenu';
import TextSizeControls from '@/components/TextSizeControls';
import TransposeControls from '@/components/TransposeControls';
import { getStoredSessionId, setStoredSessionId, clearStoredSessionId, getStoredCurrentSongId, setStoredCurrentSongId, getCustomSessionName, setCustomSessionName as saveCustomSessionName, getStoredMasterSessionId, setStoredMasterSessionId } from '@/lib/sessionStorage';
import ConnectionStatus from '@/components/ConnectionStatus';
import { getStoredSetlist, setStoredSetlist, clearStoredSetlist } from '@/lib/setlistStorage';
import { storeFile, getFile, getFilesBySession, deleteFile, migrateFilesToNewSession } from '@/lib/fileStorage';
import { getStoredTextSize, setStoredTextSize } from '@/lib/textSizeStorage';
import { getStoredTranspose, setStoredTranspose } from '@/lib/transposeStorage';
import { transposeDocument } from '@/lib/chordTransposer';
import styles from '../styles/Master.module.css';

const ChordProRenderer = dynamic(
  () => import('@/components/ChordProRenderer'),
  { ssr: false }
);

export default function MasterView() {
  const router = useRouter();
  const [socketClient, setSocketClient] = useState<SocketClient | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [document, setDocument] = useState<string>('');
  const [parsedDocument, setParsedDocument] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [scrollPosition, setScrollPosition] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useTheme();
  const [setlist, setSetlist] = useState<SetlistItem[]>([]);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [currentSongTitle, setCurrentSongTitle] = useState<string>('');
  const [customSessionIdInput, setCustomSessionIdInput] = useState<string>('');
  const [showSessionIdInput, setShowSessionIdInput] = useState<boolean>(false);
  const [textSize, setTextSize] = useState<number>(getStoredTextSize());
  const [transpose, setTranspose] = useState<number>(0);
  const [editingSessionId, setEditingSessionId] = useState<boolean>(false);
  const [sessionIdEditValue, setSessionIdEditValue] = useState<string>('');
  const [customSessionName, setCustomSessionName] = useState<string>('');
  const [draggedSetlistItem, setDraggedSetlistItem] = useState<string | null>(null);
  const [dragOverSetlistIndex, setDragOverSetlistIndex] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'syncing'>('disconnected');
  const [masterSessionId, setMasterSessionId] = useState<string | null>(null);
  const selectSongRef = useRef<((item: SetlistItem, setlistOverride?: SetlistItem[]) => void) | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    
    setIsLoading(true);
    const client = new SocketClient();
    
    // Listen for connection status changes
    client.onConnectionStatusChange((status) => {
      setConnectionStatus(status);
      setIsConnected(status === 'connected');
    });
    
    client.connect().then(() => {
      console.log('Socket connected');
      setIsConnected(true);
      setConnectionStatus('connected');
      
      // Check if room ID is provided in query params
      const { room: roomIdParam } = router.query;
      
      // Get stored master session ID if available
      let storedMasterSessionId: string | null = null;
      
      // Try to use room ID from query params, stored session ID, or create new one
      if (roomIdParam && typeof roomIdParam === 'string') {
        const normalizedRoomId = roomIdParam.toUpperCase().trim();
        storedMasterSessionId = getStoredMasterSessionId(normalizedRoomId);
        console.log('Found room ID in query params, attempting to join:', normalizedRoomId, storedMasterSessionId ? `(master session: ${storedMasterSessionId})` : '');
        return client.joinSession(normalizedRoomId, storedMasterSessionId || undefined);
      } else {
        const storedSessionId = getStoredSessionId();
        if (storedSessionId) {
          const normalizedRoomId = storedSessionId.toUpperCase().trim();
          storedMasterSessionId = getStoredMasterSessionId(normalizedRoomId);
          console.log('Found stored session ID, attempting to join:', normalizedRoomId, storedMasterSessionId ? `(master session: ${storedMasterSessionId})` : '');
          return client.joinSession(normalizedRoomId, storedMasterSessionId || undefined);
        } else {
          console.log('No stored session ID, creating new room...');
          return client.createRoom();
        }
      }
    }).then((sessionInfo) => {
      console.log('Session ready:', sessionInfo);
      const finalSessionId = sessionInfo.sessionId;
      // Set session ID (this will only happen once on initial load)
      setSessionId(finalSessionId);
      setStoredSessionId(finalSessionId);
      
      // Store master session ID if we're the master
      if (sessionInfo.isMaster && sessionInfo.masterSessionId) {
        setMasterSessionId(sessionInfo.masterSessionId);
        setStoredMasterSessionId(finalSessionId, sessionInfo.masterSessionId);
        console.log('Stored master session ID:', sessionInfo.masterSessionId);
      } else if (sessionInfo.masterSessionId) {
        // Store it even if we're not master (for future reference)
        setStoredMasterSessionId(finalSessionId, sessionInfo.masterSessionId);
      }
      
      setSocketClient(client);
      setSessionIdEditValue(finalSessionId); // Initialize edit value
      
      // Load setlist metadata for this session
      const storedSetlistMetadata = getStoredSetlist(finalSessionId);
      if (storedSetlistMetadata && storedSetlistMetadata.length > 0) {
        console.log('Loading stored setlist metadata:', storedSetlistMetadata.length, 'songs');
        // Load file contents from IndexedDB
        Promise.all(
          storedSetlistMetadata.map(async (metadata) => {
            const fileRecord = await getFile(metadata.id);
            if (fileRecord) {
              return {
                ...metadata,
                content: fileRecord.content,
              };
            }
            // Fallback: if file not found in IndexedDB, return metadata only
            return {
              ...metadata,
              content: '',
            };
          })
        ).then((loadedSetlist) => {
          // Filter out items without content (failed to load)
          const validSetlist = loadedSetlist.filter(item => item.content);
          if (validSetlist.length > 0) {
            setSetlist(validSetlist);
            // Restore the current song if there was one
            const storedCurrentSongId = getStoredCurrentSongId(finalSessionId);
            if (storedCurrentSongId) {
              const songToRestore = validSetlist.find(item => item.id === storedCurrentSongId);
              if (songToRestore && selectSongRef.current) {
                // Use setTimeout to ensure state is updated
                setTimeout(() => {
                  selectSongRef.current?.(songToRestore, validSetlist);
                }, 100);
              }
            }
          }
        }).catch((error) => {
          console.error('Error loading files from IndexedDB:', error);
        });
      }
      
      setIsLoading(false);
    }).catch((error) => {
      console.error('Failed to connect or create session:', error);
      setIsConnected(false);
      setIsLoading(false);
      alert(`Failed to connect to server: ${error.message || error}. Please check the console and refresh the page.`);
    });

    return () => {
      client.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Save setlist whenever it changes
  useEffect(() => {
    if (sessionId) {
      if (setlist.length > 0) {
        setStoredSetlist(sessionId, setlist);
      }
      // Save current song ID
      setStoredCurrentSongId(sessionId, currentSongId);
    }
  }, [setlist, sessionId, currentSongId]);

  const handleNewSession = () => {
    if (confirm('Create a new session? This will clear the current session ID and setlist.')) {
      const oldSessionId = sessionId;
      clearStoredSessionId();
      if (oldSessionId) {
        // Clear old setlist
        const { clearStoredSetlist } = require('@/lib/setlistStorage');
        clearStoredSetlist(oldSessionId);
      }
      setIsLoading(true);
      setShowSessionIdInput(false);
      setCustomSessionIdInput('');
      
      if (socketClient) {
        socketClient.disconnect();
      }
      
      const client = new SocketClient();
      
      // Listen for connection status changes
      client.onConnectionStatusChange((status) => {
        setConnectionStatus(status);
        setIsConnected(status === 'connected');
      });
      
      client.connect().then(() => {
        setIsConnected(true);
        setConnectionStatus('connected');
        return client.createRoom();
      }).then((sessionInfo) => {
        console.log('New session created:', sessionInfo);
        setSessionId(sessionInfo.sessionId);
        setStoredSessionId(sessionInfo.sessionId);
        setSocketClient(client);
        setIsLoading(false);
        // Clear setlist and current song
        setSetlist([]);
        setCurrentSongId(null);
        setDocument('');
        setParsedDocument(null);
        setCurrentSongTitle('');
      }).catch((error) => {
        console.error('Failed to create new session:', error);
        setIsConnected(false);
        setIsLoading(false);
        alert(`Failed to create new session: ${error.message || error}`);
      });
    }
  };

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

  const handleTransposeIncrease = () => {
    if (!currentSongId) return;
    const newTranspose = Math.min(11, transpose + 1);
    setTranspose(newTranspose);
    if (sessionId && currentSongId) {
      setStoredTranspose(sessionId, currentSongId, newTranspose);
      // Sync transpose to clients with document refresh to force re-render
      if (socketClient && sessionId && document) {
        // Get current scroll position before updating
        const currentScrollTop = containerRef.current?.scrollTop || 0;
        const scrollHeight = containerRef.current?.scrollHeight || 0;
        const clientHeight = containerRef.current?.clientHeight || 0;
        const maxScroll = scrollHeight - clientHeight;
        const scrollTopPercent = maxScroll > 0 ? (currentScrollTop / maxScroll) * 100 : 0;
        
        socketClient.updateContent({ 
          document: document,
          transpose: newTranspose,
          currentSongTitle: currentSongTitle,
        });
        
        // Preserve scroll position after content update
        setTimeout(() => {
          if (containerRef.current && sessionId) {
            socketClient.syncScroll(sessionId, scrollTopPercent, currentScrollTop, undefined);
          }
        }, 100);
      }
    }
  };

  const handleTransposeDecrease = () => {
    if (!currentSongId) return;
    const newTranspose = Math.max(-11, transpose - 1);
    setTranspose(newTranspose);
    if (sessionId && currentSongId) {
      setStoredTranspose(sessionId, currentSongId, newTranspose);
      // Sync transpose to clients with document refresh to force re-render
      if (socketClient && sessionId && document) {
        // Get current scroll position before updating
        const currentScrollTop = containerRef.current?.scrollTop || 0;
        const scrollHeight = containerRef.current?.scrollHeight || 0;
        const clientHeight = containerRef.current?.clientHeight || 0;
        const maxScroll = scrollHeight - clientHeight;
        const scrollTopPercent = maxScroll > 0 ? (currentScrollTop / maxScroll) * 100 : 0;
        
        socketClient.updateContent({ 
          document: document,
          transpose: newTranspose,
          currentSongTitle: currentSongTitle,
        });
        
        // Preserve scroll position after content update
        setTimeout(() => {
          if (containerRef.current && sessionId) {
            socketClient.syncScroll(sessionId, scrollTopPercent, currentScrollTop, undefined);
          }
        }, 100);
      }
    }
  };

  const handleTransposeReset = () => {
    if (!currentSongId) return;
    setTranspose(0);
    if (sessionId && currentSongId) {
      setStoredTranspose(sessionId, currentSongId, 0);
      // Sync transpose to clients with document refresh to force re-render
      if (socketClient && sessionId && document) {
        // Get current scroll position before updating
        const currentScrollTop = containerRef.current?.scrollTop || 0;
        const scrollHeight = containerRef.current?.scrollHeight || 0;
        const clientHeight = containerRef.current?.clientHeight || 0;
        const maxScroll = scrollHeight - clientHeight;
        const scrollTopPercent = maxScroll > 0 ? (currentScrollTop / maxScroll) * 100 : 0;
        
        socketClient.updateContent({ 
          document: document,
          transpose: 0,
          currentSongTitle: currentSongTitle,
        });
        
        // Preserve scroll position after content update
        setTimeout(() => {
          if (containerRef.current && sessionId) {
            socketClient.syncScroll(sessionId, scrollTopPercent, currentScrollTop, undefined);
          }
        }, 100);
      }
    }
  };

  const handleTransposeSetValue = (semitones: number) => {
    if (!currentSongId) return;
    setTranspose(semitones);
    if (sessionId && currentSongId) {
      setStoredTranspose(sessionId, currentSongId, semitones);
      // Sync transpose to clients with document refresh to force re-render
      if (socketClient && sessionId && document) {
        // Get current scroll position before updating
        const currentScrollTop = containerRef.current?.scrollTop || 0;
        const scrollHeight = containerRef.current?.scrollHeight || 0;
        const clientHeight = containerRef.current?.clientHeight || 0;
        const maxScroll = scrollHeight - clientHeight;
        const scrollTopPercent = maxScroll > 0 ? (currentScrollTop / maxScroll) * 100 : 0;
        
        socketClient.updateContent({ 
          document: document,
          transpose: semitones,
          currentSongTitle: currentSongTitle,
        });
        
        // Preserve scroll position after content update
        setTimeout(() => {
          if (containerRef.current && sessionId) {
            socketClient.syncScroll(sessionId, scrollTopPercent, currentScrollTop, undefined);
          }
        }, 100);
      }
    }
  };

  const handleCreateCustomSession = () => {
    const customId = customSessionIdInput.trim().toLowerCase();
    if (!customId) {
      alert('Please enter a session ID');
      return;
    }
    
    // Validate format (4-6 alphanumeric characters)
    const normalizedId = customId.toUpperCase().trim();
    if (!/^[A-Z0-9]{4,6}$/.test(normalizedId)) {
      alert('Room ID must be 4-6 alphanumeric characters (e.g., ABC123)');
      return;
    }
    
    setIsLoading(true);
    setShowSessionIdInput(false);
    
    if (socketClient) {
      socketClient.disconnect();
    }
    
    const client = new SocketClient();
    
    // Listen for connection status changes
    client.onConnectionStatusChange((status) => {
      setConnectionStatus(status);
      setIsConnected(status === 'connected');
    });
    
    client.connect().then(() => {
      setIsConnected(true);
      setConnectionStatus('connected');
      return client.createRoom(normalizedId);
    }).then((sessionInfo) => {
      console.log('Custom session created:', sessionInfo);
      const finalSessionId = sessionInfo.sessionId;
      setSessionId(finalSessionId);
      setStoredSessionId(finalSessionId);
      setSocketClient(client);
      setIsLoading(false);
      setCustomSessionIdInput('');
      // Load setlist if it exists for this session
      const storedSetlistMetadata = getStoredSetlist(finalSessionId);
      if (storedSetlistMetadata && storedSetlistMetadata.length > 0) {
        // Load file contents from IndexedDB
        Promise.all(
          storedSetlistMetadata.map(async (metadata) => {
            const fileRecord = await getFile(metadata.id);
            if (fileRecord) {
              return {
                ...metadata,
                content: fileRecord.content,
              };
            }
            // Fallback: if file not found in IndexedDB, return metadata only
            return {
              ...metadata,
              content: '',
            };
          })
        ).then((loadedSetlist) => {
          // Filter out items without content (failed to load)
          const validSetlist = loadedSetlist.filter(item => item.content);
          if (validSetlist.length > 0) {
            setSetlist(validSetlist);
            // Restore current song if available
            const storedCurrentSongId = getStoredCurrentSongId(finalSessionId);
            if (storedCurrentSongId) {
              const songToRestore = validSetlist.find(item => item.id === storedCurrentSongId);
              if (songToRestore) {
                selectSong(songToRestore, validSetlist);
              }
            }
          }
        }).catch((error) => {
          console.error('Error loading files from IndexedDB:', error);
        });
      }
    }).catch((error) => {
      console.error('Failed to create custom session:', error);
      setIsConnected(false);
      setIsLoading(false);
      alert(`Failed to create session: ${error.message || error}`);
      setShowSessionIdInput(true);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !sessionId) return;

    const isFirstUpload = setlist.length === 0;
    
    Array.from(files).forEach(async (file, index) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const parsed = parseChordPro(content);
        const itemId = `song-${Date.now()}-${index}-${Math.random().toString(36).substring(7)}`;
        
        const title = parsed.title || file.name.replace(/\.(cho|crd|chopro|chordpro|txt)$/i, '');
        
        // Store file in IndexedDB
        try {
          await storeFile(itemId, sessionId, file.name, title, content);
        } catch (error) {
          console.error('Error storing file in IndexedDB:', error);
        }
        
        const newItem: SetlistItem = {
          id: itemId,
          filename: file.name,
          title,
          content,
        };

        setSetlist((prev) => {
          const updated = [...prev, newItem];
          // If this is the first file uploaded or only file, select it automatically
          if ((isFirstUpload && index === 0) || (files.length === 1 && index === 0)) {
            setTimeout(() => {
              selectSong(newItem, updated);
            }, 0);
          }
          return updated;
        });
      };
      reader.readAsText(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const selectSong = useCallback((item: SetlistItem, setlistOverride?: SetlistItem[]) => {
    const listToUse = setlistOverride || setlist;
    setCurrentSongId(item.id);
    setDocument(item.content);
    const parsed = parseChordPro(item.content);
    setParsedDocument(parsed);
    
    // Load transpose for this specific song
    let songTranspose = 0;
    if (sessionId) {
      // Check if file has transpose directive first
      if (parsed.transpose !== undefined) {
        songTranspose = parsed.transpose;
        setStoredTranspose(sessionId, item.id, songTranspose);
      } else {
        // Otherwise load stored transpose for this song
        songTranspose = getStoredTranspose(sessionId, item.id);
      }
    }
    setTranspose(songTranspose);
    // Use parsed title if available, otherwise use item title
    const displayTitle = parsed.title || item.title;
    setCurrentSongTitle(displayTitle);
    
    // Update up next and previous info
    const currentIndex = listToUse.findIndex((s) => s.id === item.id);
    const nextItem = currentIndex >= 0 && currentIndex < listToUse.length - 1 
      ? listToUse[currentIndex + 1] 
      : null;
    const previousItem = currentIndex > 0 
      ? listToUse[currentIndex - 1] 
      : null;
    
    // Send to clients using unified content-change event
    if (socketClient) {
      socketClient.updateContent({
        document: item.content,
        currentSongTitle: displayTitle,
        upNextTitle: nextItem ? nextItem.title : '',
        previousSongTitle: previousItem ? previousItem.title : '',
        transpose: songTranspose, // Use the transpose loaded for this song
      });
      // Scroll to top when new song is loaded
      socketClient.updateScroll(0);
    }
  }, [setlist, socketClient, sessionId]);

  // Update ref whenever selectSong changes
  useEffect(() => {
    selectSongRef.current = selectSong;
  }, [selectSong]);

  const handleSetlistReorder = (newItems: SetlistItem[]) => {
    setSetlist(newItems);
      // Update up next and previous if we have a current song
      if (currentSongId && socketClient) {
        const currentIndex = newItems.findIndex((s) => s.id === currentSongId);
        const nextItem = currentIndex >= 0 && currentIndex < newItems.length - 1 
          ? newItems[currentIndex + 1] 
          : null;
        const previousItem = currentIndex > 0 
          ? newItems[currentIndex - 1] 
          : null;
        socketClient.updateContent({
          upNextTitle: nextItem ? nextItem.title : '',
          previousSongTitle: previousItem ? previousItem.title : '',
          transpose: transpose, // Include current transpose to keep clients in sync
        });
      }
  };

  const handleSetlistDelete = async (id: string) => {
    // Delete file from IndexedDB
    try {
      await deleteFile(id);
    } catch (error) {
      console.error('Error deleting file from IndexedDB:', error);
    }
    
    setSetlist((prev) => {
      const newSetlist = prev.filter((item) => item.id !== id);
      // If deleted song was current, select first song or clear
      if (currentSongId === id) {
          if (newSetlist.length > 0) {
          selectSong(newSetlist[0]);
        } else {
          setCurrentSongId(null);
          setDocument('');
          setParsedDocument(null);
          setCurrentSongTitle('');
          if (socketClient) {
            socketClient.updateContent({
              document: '',
              currentSongTitle: '',
              upNextTitle: '',
              previousSongTitle: '',
            });
          }
        }
      } else if (socketClient && currentSongId) {
        // Update up next and previous if current song still exists
        const currentIndex = newSetlist.findIndex((s) => s.id === currentSongId);
        const nextItem = currentIndex >= 0 && currentIndex < newSetlist.length - 1 
          ? newSetlist[currentIndex + 1] 
          : null;
        const previousItem = currentIndex > 0 
          ? newSetlist[currentIndex - 1] 
          : null;
        socketClient.updateContent({
          upNextTitle: nextItem ? nextItem.title : '',
          previousSongTitle: previousItem ? previousItem.title : '',
          transpose: transpose, // Include current transpose to keep clients in sync
        });
      }
      return newSetlist;
    });
  };

  const handleScroll = (position: number, scrollTopPercent?: number, lineIndex?: number) => {
    console.log('handleScroll called:', { position, scrollTopPercent, lineIndex, hasSocketClient: !!socketClient, sessionId });
    setScrollPosition(position);
    if (socketClient && sessionId) {
      // Use new sync-scroll event with scrollTopPercent
      if (scrollTopPercent !== undefined) {
        console.log('Sending syncScroll:', { sessionId, scrollTopPercent, position, lineIndex });
        socketClient.syncScroll(sessionId, scrollTopPercent, position, lineIndex);
      } else {
        // Fallback to legacy method
        console.log('Using legacy scroll update:', position);
        socketClient.updateScroll(position);
        if (lineIndex !== undefined) {
          socketClient.updateLineScroll(lineIndex);
        }
      }
    } else {
      console.log('Cannot sync scroll - missing socketClient or sessionId');
    }
  };

  const handleLineScroll = (lineIndex: number) => {
    // This is called from ChordProRenderer, scroll position is already calculated there
    // Just ensure we sync if needed
    if (socketClient && sessionId && containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      const scrollHeight = containerRef.current.scrollHeight;
      const clientHeight = containerRef.current.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      const scrollTopPercent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      socketClient.syncScroll(sessionId, scrollTopPercent, scrollTop, lineIndex);
    }
  };

  const handleCopySessionId = () => {
    const idToCopy = sessionId || '';
    if (idToCopy) {
      navigator.clipboard.writeText(idToCopy).then(() => {
        alert(`Room ID copied to clipboard: ${idToCopy}`);
      }).catch(() => {
        alert('Failed to copy room ID');
      });
    }
  };

  const handleShareRoom = async () => {
    if (!sessionId) return;
    
    const url = `${window.location.origin}/${sessionId}`;
    
    if (navigator.share) {
      // Use native share sheet on mobile
      try {
        await navigator.share({
          title: 'Join ChordPro Session',
          text: `Join my ChordPro session: ${sessionId}`,
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

  const handleChangeSessionId = async () => {
    console.log('handleChangeSessionId called', { sessionId, sessionIdEditValue });
    
    if (!sessionId) {
      alert('No current session ID found');
      return;
    }
    
    if (!sessionIdEditValue || !sessionIdEditValue.trim()) {
      alert('Please enter a session ID');
      return;
    }
    
    const newSessionId = sessionIdEditValue.trim().toUpperCase();
    console.log('New room ID:', newSessionId);
    
    // Validate room ID format (4-6 alphanumeric characters)
    if (!/^[A-Z0-9]{4,6}$/.test(newSessionId)) {
      alert('Room ID must be 4-6 alphanumeric characters (e.g., ABC123)');
      return;
    }
    
    if (newSessionId === sessionId) {
      console.log('Session ID unchanged, closing editor');
      setEditingSessionId(false);
      return;
    }
    
    // Confirm the change
    if (!confirm(`Change session ID from "${sessionId}" to "${newSessionId}"? This will migrate all your files and setlist.`)) {
      console.log('User cancelled session ID change');
      return;
    }
    
    console.log('Starting session ID change process...');
    
    const oldSessionId = sessionId;
    
    try {
      console.log('Step 1: Saving current state...');
      // Save current setlist and state before migration
      const currentSetlist = [...setlist];
      const currentSongIdToRestore = currentSongId;
      console.log('Current setlist length:', currentSetlist.length);
      
      console.log('Step 2: Disconnecting from old session...');
      // Disconnect from old session
      if (socketClient) {
        socketClient.disconnect();
      }
      
      console.log('Step 3: Migrating files in IndexedDB...');
      // Migrate files in IndexedDB to new session ID
      await migrateFilesToNewSession(oldSessionId, newSessionId);
      console.log('Files migrated successfully');
      
      console.log('Step 4: Migrating setlist metadata...');
      // Migrate setlist metadata
      const setlistMetadata = getStoredSetlist(oldSessionId);
      if (setlistMetadata) {
        setStoredSetlist(newSessionId, currentSetlist);
        clearStoredSetlist(oldSessionId);
        console.log('Setlist migrated successfully');
      }
      
      console.log('Step 5: Migrating current song ID...');
      // Migrate current song ID
      if (currentSongIdToRestore) {
        setStoredCurrentSongId(newSessionId, currentSongIdToRestore);
        setStoredCurrentSongId(oldSessionId, null);
      }
      
      console.log('Step 6: Updating session ID storage...');
      // Update session ID storage
      setStoredSessionId(newSessionId);
      
      // Clear custom name for old session
      saveCustomSessionName(oldSessionId, '');
      
      console.log('Step 7: Connecting to new session...');
      // Connect to new session
      setIsLoading(true);
      const client = new SocketClient();
      
      // Listen for connection status changes
      client.onConnectionStatusChange((status) => {
        setConnectionStatus(status);
        setIsConnected(status === 'connected');
      });
      
      await client.connect();
      console.log('Socket connected');
      setIsConnected(true);
      setConnectionStatus('connected');
      
      console.log('Step 8: Creating room with new ID:', newSessionId);
      // Create room with the new custom ID
      const sessionInfo = await client.createRoom(newSessionId);
      
      // Store master session ID
      if (sessionInfo.isMaster && sessionInfo.masterSessionId) {
        setMasterSessionId(sessionInfo.masterSessionId);
        setStoredMasterSessionId(newSessionId, sessionInfo.masterSessionId);
      }
      console.log('Session created:', sessionInfo);
      
      if (sessionInfo.sessionId !== newSessionId) {
        throw new Error(`Failed to create session with ID ${newSessionId}. Got ${sessionInfo.sessionId} instead.`);
      }
      
      setSessionId(sessionInfo.sessionId);
      setSocketClient(client);
      
      // Restore setlist and current song
      if (currentSetlist.length > 0) {
        setSetlist(currentSetlist);
        if (currentSongIdToRestore) {
          const songToRestore = currentSetlist.find(item => item.id === currentSongIdToRestore);
          if (songToRestore) {
            setTimeout(() => {
              selectSong(songToRestore, currentSetlist);
            }, 100);
          }
        }
      }
      
      setEditingSessionId(false);
      setIsLoading(false);
      setSessionIdEditValue(newSessionId); // Update edit value to new ID
      
      alert(`Session ID successfully changed to "${newSessionId}"`);
      
    } catch (error) {
      console.error('Error changing session ID:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to change session ID: ${errorMessage}\n\nAttempting to reconnect to original session...`);
      setIsLoading(false);
      setEditingSessionId(false);
      
      // Try to reconnect to old session
      if (socketClient) {
        socketClient.disconnect();
      }
      const client = new SocketClient();
      
      // Listen for connection status changes
      client.onConnectionStatusChange((status) => {
        setConnectionStatus(status);
        setIsConnected(status === 'connected');
      });
      
      try {
        await client.connect();
        const storedMasterSessionId = getStoredMasterSessionId(oldSessionId.toUpperCase().trim());
        const sessionInfo = await client.joinSession(oldSessionId.toUpperCase().trim(), storedMasterSessionId || undefined);
        setSessionId(oldSessionId);
        setSessionIdEditValue(oldSessionId);
        setSocketClient(client);
        setIsConnected(true);
        setConnectionStatus('connected');
        if (sessionInfo.masterSessionId) {
          setMasterSessionId(sessionInfo.masterSessionId);
        }
        alert('Reconnected to original session');
      } catch (reconnectError) {
        console.error('Failed to reconnect to old session:', reconnectError);
        alert('Failed to reconnect to original session. Please refresh the page.');
      }
    }
  };

  // Get the next song in the setlist
  const getNextSong = (): SetlistItem | null => {
    if (!currentSongId || setlist.length === 0) return null;
    const currentIndex = setlist.findIndex((item) => item.id === currentSongId);
    if (currentIndex === -1 || currentIndex === setlist.length - 1) return null;
    return setlist[currentIndex + 1];
  };

  // Get the previous song in the setlist
  const getPreviousSong = (): SetlistItem | null => {
    if (!currentSongId || setlist.length === 0) return null;
    const currentIndex = setlist.findIndex((item) => item.id === currentSongId);
    if (currentIndex <= 0) return null;
    return setlist[currentIndex - 1];
  };

  const handleNextSong = () => {
    const nextSong = getNextSong();
    if (nextSong) {
      selectSong(nextSong);
    }
  };

  const handlePreviousSong = () => {
    const previousSong = getPreviousSong();
    if (previousSong) {
      selectSong(previousSong);
    }
  };

  const nextSong = getNextSong();
  const previousSong = getPreviousSong();

  return (
    <div className={`${styles.container} ${theme === 'dark' ? styles.dark : ''}`}>
      <ConnectionStatus status={connectionStatus} theme={theme} />
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            {previousSong ? (
              <button
                onClick={handlePreviousSong}
                className={styles.previousSongButton}
                title="Go to previous song"
              >
                <span className={styles.previousLabel}>Previous:</span> {previousSong.title}
              </button>
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
            {nextSong ? (
              <button
                onClick={handleNextSong}
                className={styles.nextSongButton}
                title="Go to next song"
              >
                <span className={styles.nextLabel}>Next up:</span> {nextSong.title}
              </button>
            ) : (
              <span className={styles.endLabel}>END</span>
            )}
          </div>
          <div className={styles.headerActions}>
            <HamburgerMenu theme={theme}>
              <h2 className={styles.menuTitle}>Menu</h2>
              {isLoading ? (
                <div className={styles.menuItem}>
                  <span className={styles.menuLabel}>Status:</span>
                  <span className={styles.menuValue}>Connecting...</span>
                </div>
              ) : sessionId ? (
                <>
                  <div className={styles.menuItem}>
                    <span className={styles.menuLabel}>Room ID:</span>
                    <div className={styles.menuSessionId}>
                      {editingSessionId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                          <input
                            type="text"
                            value={sessionIdEditValue}
                            onChange={(e) => setSessionIdEditValue(e.target.value)}
                            className={styles.menuInput}
                            placeholder="e.g., ABC123"
                            maxLength={50}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleChangeSessionId();
                              } else if (e.key === 'Escape') {
                                setEditingSessionId(false);
                                setSessionIdEditValue(sessionId || '');
                              }
                            }}
                          />
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('Change ID button clicked');
                                handleChangeSessionId().catch((error) => {
                                  console.error('Unhandled error in handleChangeSessionId:', error);
                                  alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                });
                              }}
                              className={styles.menuButton}
                              style={{ flex: 1 }}
                              disabled={isLoading}
                              type="button"
                            >
                              {isLoading ? 'Changing...' : 'Change ID'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingSessionId(false);
                                setSessionIdEditValue(sessionId || '');
                              }}
                              className={styles.menuButtonSecondary}
                              style={{ flex: 1 }}
                              disabled={isLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className={styles.sessionId} title={sessionId || ''}>
                            {sessionId}
                          </span>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => {
                                setEditingSessionId(true);
                                setSessionIdEditValue(sessionId || '');
                              }}
                              className={styles.editButton}
                              title="Change session ID"
                            >
                              ✏️
                            </button>
                            <button onClick={handleCopySessionId} className={styles.copyButton}>
                              Copy
                            </button>
                            <button onClick={handleShareRoom} className={styles.copyButton} style={{ marginLeft: '0.25rem' }}>
                              Share
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={styles.menuItem}>
                    <span className={styles.menuLabel}>Status:</span>
                    <span className={isConnected ? styles.connected : styles.disconnected}>
                      {isConnected ? '● Connected' : '○ Disconnected'}
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.menuItem}>
                  <span className={styles.menuLabel}>Status:</span>
                  <span className={styles.errorLabel}>No session ID</span>
                </div>
              )}
              <div className={styles.menuDivider} />
              {!sessionId && !isLoading && (
                <>
                  {!showSessionIdInput ? (
                    <button
                      onClick={() => setShowSessionIdInput(true)}
                      className={styles.menuButton}
                    >
                      Set Custom Room ID
                    </button>
                  ) : (
                    <div className={styles.menuItem}>
                      <label className={styles.menuLabel}>Custom Room ID:</label>
                      <input
                        type="text"
                        value={customSessionIdInput}
                        onChange={(e) => setCustomSessionIdInput(e.target.value)}
                        placeholder="e.g., ABC123"
                        className={styles.menuInput}
                        pattern="[A-Z0-9]{4,6}"
                      />
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          onClick={handleCreateCustomSession}
                          className={styles.menuButton}
                          style={{ flex: 1 }}
                        >
                          Create
                        </button>
                        <button
                          onClick={() => {
                            setShowSessionIdInput(false);
                            setCustomSessionIdInput('');
                          }}
                          className={styles.menuButtonSecondary}
                          style={{ flex: 1 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  <div className={styles.menuDivider} />
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".cho,.crd,.chopro,.chordpro,.txt"
                onChange={handleFileUpload}
                multiple
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={styles.menuButton}
              >
                Add Songs
              </button>
              {sessionId && (
                <button
                  onClick={handleNewSession}
                  className={styles.menuButton}
                >
                  New Session
                </button>
              )}
              <button
                onClick={() => router.push('/')}
                className={styles.menuButton}
              >
                Back to Home
              </button>
              <div className={styles.menuDivider} />
              <div className={styles.setlistSection}>
                <h3 className={styles.setlistTitle}>Setlist</h3>
                {setlist.length === 0 ? (
                  <div className={styles.setlistEmpty}>
                    <p>No songs in setlist</p>
                    <p className={styles.setlistHint}>Upload files to add songs</p>
                  </div>
                ) : (
                  <div className={styles.setlistList}>
                    {setlist.map((item, index) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggedSetlistItem(item.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', item.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverSetlistIndex(index);
                        }}
                        onDragLeave={() => {
                          setDragOverSetlistIndex(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverSetlistIndex(null);
                          const draggedId = e.dataTransfer.getData('text/plain');
                          if (draggedId && draggedId !== item.id && draggedSetlistItem) {
                            const draggedIndex = setlist.findIndex((i) => i.id === draggedId);
                            if (draggedIndex !== -1 && draggedIndex !== index) {
                              const newItems = [...setlist];
                              const [removed] = newItems.splice(draggedIndex, 1);
                              newItems.splice(index, 0, removed);
                              handleSetlistReorder(newItems);
                            }
                          }
                          setDraggedSetlistItem(null);
                        }}
                        onDragEnd={() => {
                          setDraggedSetlistItem(null);
                          setDragOverSetlistIndex(null);
                        }}
                        className={`${styles.setlistItem} ${
                          currentSongId === item.id ? styles.setlistItemActive : ''
                        } ${
                          draggedSetlistItem === item.id ? styles.setlistItemDragging : ''
                        } ${
                          dragOverSetlistIndex === index ? styles.setlistItemDragOver : ''
                        }`}
                        onClick={() => selectSong(item)}
                      >
                        <div className={styles.setlistItemContent}>
                          <div className={styles.setlistItemTitle}>{item.title || item.filename}</div>
                          <div className={styles.setlistItemFilename}>{item.filename}</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Remove this song from the setlist?')) {
                              handleSetlistDelete(item.id);
                            }
                          }}
                          className={styles.setlistDeleteButton}
                          aria-label="Delete"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </HamburgerMenu>
          </div>
        </div>
      </div>

      <div className={styles.mainContent}>
        <div 
          className={styles.content}
          ref={containerRef}
          onScroll={(e) => {
            const target = e.currentTarget;
            const scrollTop = target.scrollTop;
            const scrollHeight = target.scrollHeight;
            const clientHeight = target.clientHeight;
            const maxScroll = scrollHeight - clientHeight;
            const scrollTopPercent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
            
            console.log('Master scroll event:', { scrollTop, scrollHeight, clientHeight, maxScroll, scrollTopPercent });
            
            // Calculate line index for better sync
            let lineIndex: number | undefined = undefined;
            if (parsedDocument) {
              // Find the line closest to scroll position
              const allLines = target.querySelectorAll('[data-line-index]');
              console.log('Found lines:', allLines.length);
              let minDistance = Infinity;
              allLines.forEach((lineEl) => {
                const element = lineEl as HTMLElement;
                const lineIdx = parseInt(element.dataset.lineIndex || '0', 10);
                const elementTop = element.offsetTop;
                const distance = Math.abs(scrollTop - elementTop);
                if (distance < minDistance) {
                  minDistance = distance;
                  lineIndex = lineIdx;
                }
              });
              console.log('Calculated line index:', lineIndex);
            }
            
            handleScroll(scrollTop, scrollTopPercent, lineIndex);
          }}
        >
        {parsedDocument ? (
          <>
            {/* Transpose controls above song */}
            {currentSongId && (
              <div className={styles.transposeSection}>
                <TransposeControls
                  transpose={transpose}
                  originalKey={parsedDocument?.key}
                  onIncrease={handleTransposeIncrease}
                  onDecrease={handleTransposeDecrease}
                  onReset={handleTransposeReset}
                  onSetValue={handleTransposeSetValue}
                  theme={theme}
                />
              </div>
            )}
            <ChordProRenderer
              key={`${currentSongId || 'default'}-transpose-${transpose}`}
              document={transpose !== 0 ? transposeDocument(parsedDocument, transpose) : parsedDocument}
              isMaster={false}
              theme={theme}
              textSize={textSize}
            />
          </>
        ) : (
          <div className={styles.emptyState}>
            <p>Upload a ChordPro file to get started</p>
            <p className={styles.emptyStateHint}>
              Supported formats: .cho, .crd, .chopro, .chordpro, .txt
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
