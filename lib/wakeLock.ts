/**
 * Screen Wake Lock API wrapper for preventing screen dimming/locking
 * on mobile devices during performances
 */

let wakeLock: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<boolean> {
  if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
    console.log('Wake Lock API not supported');
    return false;
  }

  try {
    wakeLock = await (navigator as any).wakeLock.request('screen');
    console.log('Wake Lock activated');
    
    // Handle wake lock release (e.g., when tab becomes hidden)
    wakeLock.addEventListener('release', () => {
      console.log('Wake Lock released');
    });
    
    return true;
  } catch (error) {
    console.error('Error requesting wake lock:', error);
    return false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
      console.log('Wake Lock released manually');
    } catch (error) {
      console.error('Error releasing wake lock:', error);
    }
  }
}

// Re-request wake lock when page becomes visible again
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && wakeLock === null) {
      // Try to re-request if we had one before
      await requestWakeLock();
    }
  });
}
