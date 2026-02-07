import React from 'react';
import styles from './TextSizeControls.module.css';

interface TextSizeControlsProps {
  textSize: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onReset: () => void;
  theme?: 'light' | 'dark';
}

export default function TextSizeControls({
  textSize,
  onIncrease,
  onDecrease,
  onReset,
  theme = 'light',
}: TextSizeControlsProps) {
  const percentage = Math.round(textSize * 100);

  return (
    <div className={`${styles.controls} ${theme === 'dark' ? styles.dark : ''}`}>
      <button
        onClick={onDecrease}
        className={styles.button}
        aria-label="Decrease text size"
        disabled={textSize <= 0.5}
      >
        A−
      </button>
      <span className={styles.sizeDisplay}>{percentage}%</span>
      <button
        onClick={onIncrease}
        className={styles.button}
        aria-label="Increase text size"
        disabled={textSize >= 2.0}
      >
        A+
      </button>
      {textSize !== 1.0 && (
        <button
          onClick={onReset}
          className={styles.resetButton}
          aria-label="Reset text size"
        >
          Reset
        </button>
      )}
    </div>
  );
}
