import { useCallback, useEffect, useRef, useState } from 'react';

export type LocationState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied'; reason: string };

/**
 * Requests the browser's Geolocation once and caches the result.
 * Returns the current state and a `request()` function to trigger the prompt.
 */
export function useLocation(): { location: LocationState; request: () => void } {
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const requested = useRef(false);

  const request = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    if (!navigator.geolocation) {
      setLocation({ status: 'denied', reason: 'Geolocation is not supported by this browser.' });
      return;
    }
    setLocation({ status: 'pending' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          status: 'granted',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        setLocation({ status: 'denied', reason: err.message });
        requested.current = false; // allow retry after denial
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  // Attempt silently on mount (will no-op if already denied / not supported)
  useEffect(() => { request(); }, [request]);

  return { location, request };
}
