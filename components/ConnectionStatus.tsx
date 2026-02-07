import React from 'react';
import styles from './ConnectionStatus.module.css';

interface ConnectionStatusProps {
  status: 'connected' | 'disconnected' | 'syncing';
  theme?: 'light' | 'dark';
}

export default function ConnectionStatus({ status, theme = 'light' }: ConnectionStatusProps) {
  if (status === 'connected') {
    return null; // Don't show anything when connected
  }

  return (
    <div className={`${styles.statusBar} ${theme === 'dark' ? styles.dark : ''} ${styles[status]}`}>
      <div className={styles.statusContent}>
        {status === 'syncing' && (
          <>
            <span className={styles.spinner}>⟳</span>
            <span>Syncing...</span>
          </>
        )}
        {status === 'disconnected' && (
          <>
            <span className={styles.icon}>⚠</span>
            <span>Disconnected</span>
          </>
        )}
      </div>
    </div>
  );
}
