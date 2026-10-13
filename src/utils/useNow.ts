import { useEffect, useState } from 'react';

// Milliseconds until the next minute boundary (plus a small margin so we land just after it)
const msToNextMinute = () => 60000 - (Date.now() % 60000) + 50;

/**
 * Returns the current Date, refreshed at the top of every minute and whenever the tab
 * becomes visible again (timers are throttled/paused in background tabs and during sleep).
 */
export function useNow(): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, msToNextMinute());
    };
    timer = window.setTimeout(tick, msToNextMinute());

    const onVisibility = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return now;
}
