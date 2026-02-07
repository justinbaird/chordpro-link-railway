import React from 'react';
import styles from './TransposeControls.module.css';
import { getKeyName, parseKeyToSemitones } from '@/lib/chordTransposer';

interface TransposeControlsProps {
  transpose: number;
  originalKey?: string; // Original key from ChordPro file (e.g., "C", "Am", "D")
  onIncrease: () => void;
  onDecrease: () => void;
  onReset: () => void;
  onSetValue?: (semitones: number) => void;
  theme?: 'light' | 'dark';
}

export default function TransposeControls({
  transpose,
  originalKey,
  onIncrease,
  onDecrease,
  onReset,
  onSetValue,
  theme = 'light',
}: TransposeControlsProps) {
  // Calculate original key semitones (default to C if not provided)
  const originalKeySemitones = originalKey ? parseKeyToSemitones(originalKey) : 0;
  const originalKeyName = originalKey || 'C';
  
  // Current key is original key + transpose offset
  const currentKeySemitones = originalKeySemitones + transpose;
  const currentKey = getKeyName(currentKeySemitones);
  const isTransposed = transpose !== 0;

  return (
    <div className={`${styles.controls} ${theme === 'dark' ? styles.dark : ''}`}>
      <button
        onClick={onDecrease}
        className={styles.button}
        aria-label="Transpose down one semitone"
        disabled={transpose <= -11}
        title="Transpose down (♭)"
      >
        ♭
      </button>
      
      <div className={styles.display}>
        {isTransposed ? (
          <>
            <span className={styles.keyLabel}>Key:</span>
            <span className={styles.keyValue}>{currentKey}</span>
            <span className={styles.semitones}>
              ({originalKeyName} {transpose > 0 ? '+' : ''}{transpose})
            </span>
          </>
        ) : (
          <span className={styles.originalKey}>Original: {originalKeyName}</span>
        )}
      </div>

      <button
        onClick={onIncrease}
        className={styles.button}
        aria-label="Transpose up one semitone"
        disabled={transpose >= 11}
        title="Transpose up (♯)"
      >
        ♯
      </button>

      {isTransposed && (
        <button
          onClick={onReset}
          className={styles.resetButton}
          aria-label="Reset to original key"
          title="Reset to original key"
        >
          Reset
        </button>
      )}

      {onSetValue && (
        <select
          className={styles.keySelect}
          value={transpose}
          onChange={(e) => onSetValue(parseInt(e.target.value, 10))}
          aria-label="Select key"
        >
          {Array.from({ length: 12 }, (_, i) => i - 11).map((semitones) => {
            const keySemitones = originalKeySemitones + semitones;
            const keyName = getKeyName(keySemitones);
            return (
              <option key={semitones} value={semitones}>
                {keyName} {semitones > 0 ? `(+${semitones})` : semitones < 0 ? `(${semitones})` : `(${originalKeyName})`}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
}
