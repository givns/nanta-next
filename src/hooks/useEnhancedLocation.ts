// hooks/useEnhancedLocation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { LocationState } from '@/types/attendance';
import { EnhancedLocationService } from '@/services/location/EnhancedLocationService';
import { LOCATION_CONSTANTS } from '@/types/attendance/base';

export function useEnhancedLocation() {
  const locationService = useRef(new EnhancedLocationService());
  const [locationState, setLocationState] = useState<LocationState>({
    status: 'initializing',
    inPremises: false,
    address: '',
    confidence: 'low',
    accuracy: 0,
    error: null,
  });

  const locationRef = useRef<{
    promise: Promise<any> | null;
    timestamp: number;
    data: LocationState | null;
    retryCount: number;
  }>({
    promise: null,
    timestamp: 0,
    data: null,
    retryCount: 0,
  });

  const getCurrentLocation = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    // Return cached location if valid
    if (
      !forceRefresh &&
      locationRef.current.data &&
      now - locationRef.current.timestamp < LOCATION_CONSTANTS.CACHE_TIME
    ) {
      return locationRef.current.data;
    }

    // Don't create multiple pending requests
    if (locationRef.current.promise) {
      return locationRef.current.promise;
    }

    try {
      setLocationState((prev) => ({ ...prev, status: 'loading' }));
      const locationPromise = locationService.current.getCurrentLocation();
      locationRef.current.promise = locationPromise;

      const result = await locationPromise;
      const newLocationState: LocationState = {
        status: 'ready',
        inPremises: result.inPremises,
        address: result.address || '',
        confidence: result.confidence || 'low',
        accuracy: result.accuracy || 0,
        coordinates: result.coordinates,
        error: null,
      };

      setLocationState(newLocationState);
      locationRef.current.data = newLocationState;
      locationRef.current.timestamp = now;
      locationRef.current.retryCount = 0;

      return newLocationState;
    } catch (error) {
      // Implement retry logic
      if (locationRef.current.retryCount < MAX_RETRIES) {
        locationRef.current.retryCount++;
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * locationRef.current.retryCount),
        );
        return getCurrentLocation(forceRefresh);
      }

      const errorState: LocationState = {
        status: 'error',
        inPremises: false,
        address: '',
        confidence: 'low',
        accuracy: 0,
        error: error instanceof Error ? error.message : 'Location error',
      };
      setLocationState(errorState);
      throw error;
    } finally {
      locationRef.current.promise = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initLocation = async () => {
      try {
        if (mounted) {
          await getCurrentLocation();
        }
      } catch (error) {
        console.error('Failed to initialize location:', error);
      }
    };

    initLocation();

    return () => {
      mounted = false;
    };
  }, [getCurrentLocation]);

  return {
    locationState,
    locationReady: locationState.status === 'ready',
    locationError: locationState.error,
    getCurrentLocation,
    isLoading:
      locationState.status === 'loading' ||
      locationState.status === 'initializing',
  };
}
