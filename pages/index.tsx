import { useState } from 'react';
import { useRouter } from 'next/router';
import { useTheme } from '@/lib/useTheme';
import ThemeToggle from '@/components/ThemeToggle';
import styles from '../styles/Home.module.css';

export default function Home() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');
  const [theme, setTheme] = useTheme();

  const handleCreateSession = () => {
    // Create a new room and redirect to master view
    router.push('/master');
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionId.trim()) {
      // Normalize to uppercase for consistency
      const normalizedRoomId = sessionId.trim().toUpperCase();
      router.push(`/${normalizedRoomId}`);
    }
  };

  return (
    <div className={`${styles.container} ${theme === 'dark' ? styles.dark : ''}`}>
      <div className={styles.themeToggleContainer}>
        <ThemeToggle
          theme={theme}
          onToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        />
      </div>
      <main className={styles.main}>
        <h1 className={styles.title}>ChordPro Link</h1>
        <p className={styles.description}>
          Share chord charts and lyrics in real-time with your band
        </p>

        <div className={styles.actions}>
          <div className={styles.actionCard}>
            <h2>Create Session</h2>
            <p>Start a new session and control the view</p>
            <button onClick={handleCreateSession} className={styles.button}>
              Create Master View
            </button>
          </div>

          <div className={styles.actionCard}>
            <h2>Join Session</h2>
            <p>Join an existing session to view synchronized content</p>
            <form onSubmit={handleJoinSession} className={styles.joinForm}>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="e.g., ABC123"
                className={styles.input}
                maxLength={30}
              />
              <button type="submit" className={styles.button}>
                Join Session
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
