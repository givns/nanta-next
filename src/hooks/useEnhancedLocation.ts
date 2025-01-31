// hooks/useEnhancedLocation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { LocationState } from '@/types/attendance';
import { EnhancedLocationService } from '@/services/location/EnhancedLocationService';
import { LOCATION_CONSTANTS } from '@/types/attendance/base';

const INITIAL_STATE: LocationState = {
  status: 'initializing',
  verificationStatus: 'pending',
  inPremises: false,
  address: '',
  confidence: 'low',
  accuracy: 0,
  error: null,
  triggerReason: null,
};

export function useEnhancedLocation() {
  const locationService = useRef(new EnhancedLocationService());
  const [locationState, setLocationState] =
    useState<LocationState>(INITIAL_STATE);
  const isMounted = useRef(true);

  // Track location requests
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const updateLocationState = useCallback((newState: LocationState) => {
    if (isMounted.current) {
      console.log('Updating location state:', {
        from: locationRef.current.data,
        to: newState,
        changed: {
          status: locationRef.current.data?.status !== newState.status,
          verification:
            locationRef.current.data?.verificationStatus !==
            newState.verificationStatus,
        },
      });

      locationRef.current.data = newState;
      setLocationState(newState);
    }
  }, []);

  const getCurrentLocation = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now();

      // More robust caching mechanism
      if (
        !forceRefresh &&
        locationRef.current.data &&
        now - locationRef.current.timestamp < LOCATION_CONSTANTS.CACHE_TIME &&
        locationRef.current.data.status === 'ready'
      ) {
        return locationRef.current.data;
      }

      // Prevent multiple concurrent requests with a promise cache
      if (locationRef.current.promise) {
        return locationRef.current.promise;
      }

      // Wrap the entire location fetch in a promise to maintain request consistency
      locationRef.current.promise = (async () => {
        try {
          // Detailed loading state
          updateLocationState({
            ...(locationRef.current.data || INITIAL_STATE),
            status: 'loading',
            verificationStatus: 'pending',
          });

          const result =
            await locationService.current.getCurrentLocation(forceRefresh);

          if (!isMounted.current) return result;

          // Comprehensive state handling
          const newLocationState: LocationState = {
            status: result.error ? 'error' : 'ready',
            inPremises: result.inPremises || false,
            address: result.address || '',
            confidence: result.confidence || 'low',
            accuracy: result.accuracy || 0,
            coordinates: result.coordinates,
            error: result.error || null,
            verificationStatus: result.error
              ? 'needs_verification'
              : result.inPremises
                ? 'verified'
                : 'needs_verification',
            triggerReason: result.error
              ? result.triggerReason || 'Location fetch error'
              : result.inPremises
                ? null
                : 'Out of premises',
          };

          updateLocationState(newLocationState);

          locationRef.current.timestamp = now;
          locationRef.current.retryCount = 0;

          return newLocationState;
        } catch (error) {
          const errorState: LocationState = {
            status: 'error',
            inPremises: false,
            address: '',
            confidence: 'low',
            accuracy: 0,
            coordinates: undefined,
            error:
              error instanceof GeolocationPositionError && error.code === 1
                ? 'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น'
                : 'เกิดข้อผิดพลาดในการระบุตำแหน่ง',
            verificationStatus: 'needs_verification',
            triggerReason:
              error instanceof GeolocationPositionError && error.code === 1
                ? 'Location permission denied'
                : 'Location error',
          };

          updateLocationState(errorState);
          return errorState;
        } finally {
          locationRef.current.promise = null;
        }
      })();

      return locationRef.current.promise;
    },
    [updateLocationState],
  );

  // Initialize location on mount
  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  // Use computed values instead of useMemo
  const { status, verificationStatus, error } = locationState;
  const locationReady = status === 'ready';
  const locationVerified = verificationStatus === 'verified';
  const isLoading = status === 'loading' || status === 'initializing';

  return {
    locationState,
    locationReady,
    locationVerified,
    locationError: error,
    getCurrentLocation,
    isLoading,
  };
}
