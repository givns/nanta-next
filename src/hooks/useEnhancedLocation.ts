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

  // Track ongoing location requests
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

  const getCurrentLocation = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Return cached location if valid and not forcing refresh
    if (
      !forceRefresh &&
      locationRef.current.data &&
      now - locationRef.current.timestamp < LOCATION_CONSTANTS.CACHE_TIME
    ) {
      return locationRef.current.data;
    }

    // Prevent multiple concurrent requests
    if (locationRef.current.promise) {
      return locationRef.current.promise;
    }

    try {
      // Update loading state
      if (isMounted.current) {
        setLocationState((prev) => ({ ...prev, status: 'loading' }));
      }

      // Get location
      const result =
        await locationService.current.getCurrentLocation(forceRefresh);

      // Handle unmounted component
      if (!isMounted.current) return result;

      if (result.error) {
        const errorState: LocationState = {
          status: 'error',
          inPremises: false,
          address: '',
          confidence: 'low',
          accuracy: 0,
          error: result.error,
          coordinates: undefined,
          verificationStatus: 'pending',
          triggerReason: result.triggerReason || 'Unknown error',
        };
        setLocationState(errorState);
        locationRef.current.data = errorState;
        return errorState;
      }

      const newLocationState: LocationState = {
        status: 'ready',
        inPremises: result.inPremises,
        address: result.address || '',
        confidence: result.confidence || 'low',
        accuracy: result.accuracy || 0,
        coordinates: result.coordinates,
        error: null,
        verificationStatus: result.inPremises
          ? 'verified'
          : 'needs_verification',
        triggerReason: result.inPremises ? null : 'Out of premises',
      };

      if (isMounted.current) {
        setLocationState(newLocationState);
        locationRef.current.data = newLocationState;
        locationRef.current.timestamp = now;
        locationRef.current.retryCount = 0;
      }

      return newLocationState;
    } catch (error) {
      console.error('Location fetch error:', error);

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
        verificationStatus: 'pending',
        triggerReason:
          error instanceof GeolocationPositionError && error.code === 1
            ? 'Location permission denied'
            : 'Location error',
      };

      if (isMounted.current) {
        setLocationState(errorState);
        locationRef.current.data = errorState;
      }

      return errorState;
    } finally {
      locationRef.current.promise = null;
    }
  }, []);

  // Initialize location on mount
  useEffect(() => {
    getCurrentLocation();
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
