// hooks/useLocationContext.ts

import { EnhancedLocationService } from '@/services/EnhancedLocationService';
import { LOCATION_CONSTANTS } from '@/types/attendance';
import { useRef, useState, useCallback, useEffect } from 'react';

export function useLocationContext() {
  const locationService = useRef(new EnhancedLocationService());
  const [state, setState] = useState<LocationContextState>({
    status: 'initializing',
    data: null,
    error: null,
  });

  const getLocation = useCallback(
    async (options?: { force?: boolean }) => {
      if (state.status === 'loading' && !options?.force) return;

      setState((prev) => ({ ...prev, status: 'loading' }));

      try {
        const location = await locationService.current.getCurrentLocation();

        // Determine confidence level
        const confidence =
          location.accuracy && location.accuracy <= 50
            ? 'high'
            : location.accuracy && location.accuracy <= 100
              ? 'medium'
              : 'low';

        setState({
          status: 'ready',
          data: {
            ...location,
            confidence,
            timestamp: Date.now(),
          },
          error: null,
        });
      } catch (error) {
        setState({
          status: 'error',
          data: state.data, // Keep last known location
          error: error instanceof Error ? error.message : 'Location error',
        });
      }
    },
    [state.status, state.data],
  );

  // Regular refresh
  useEffect(() => {
    const interval = setInterval(() => {
      getLocation({ force: true });
    }, LOCATION_CONSTANTS.REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [getLocation]);

  // Manual location override
  const overrideLocation = useCallback((address: string) => {
    setState((prev) => ({
      status: 'ready',
      data: prev.data
        ? {
            ...prev.data,
            inPremises: false,
            address,
            confidence: 'manual',
            timestamp: Date.now(),
          }
        : null,
      error: null,
    }));
  }, []);

  return {
    ...state,
    getLocation,
    overrideLocation,
    isReady: state.status === 'ready' && !!state.data,
    isStale:
      state.data &&
      Date.now() - state.data.timestamp > LOCATION_CONSTANTS.STALE_THRESHOLD,
  };
}
