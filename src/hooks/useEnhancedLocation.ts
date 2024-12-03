// hooks/useEnhancedLocation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { LocationState } from '@/types/attendance';
import { EnhancedLocationService } from '@/services/EnhancedLocationService';
import { LOCATION_CONSTANTS } from '@/types/attendance/base';

export function useEnhancedLocation() {
  const locationService = useRef(new EnhancedLocationService());
  const [locationState, setLocationState] = useState<LocationState>({
    status: 'initializing',
    inPremises: false,
    address: '',
    confidence: 'low',
    error: null,
  });

  const locationRef = useRef<{
    promise: Promise<any> | null;
    timestamp: number;
    data: LocationState | null;
  }>({
    promise: null,
    timestamp: 0,
    data: null,
  });

  const getCurrentLocation = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

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
        coordinates: result.coordinates,
        error: null,
      };

      setLocationState(newLocationState);
      locationRef.current.data = newLocationState;
      locationRef.current.timestamp = now;

      return newLocationState;
    } catch (error) {
      const errorState: LocationState = {
        status: 'error',
        inPremises: false,
        address: '',
        confidence: 'low',
        error: error instanceof Error ? error.message : 'Location error',
      };
      setLocationState(errorState);
      throw error;
    } finally {
      locationRef.current.promise = null;
    }
  }, []);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  return {
    locationState,
    locationReady: locationState.status === 'ready',
    locationError: locationState.error,
    getCurrentLocation,
  };
}
