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
      const result =
        await locationService.current.getCurrentLocation(forceRefresh);

      if (result.error) {
        const errorState: LocationState = {
          status: 'error',
          inPremises: false,
          address: '',
          confidence: 'low',
          accuracy: 0,
          error: result.error,
          coordinates: undefined, // Make sure this is undefined, not null
        };
        setLocationState(errorState);
        locationRef.current.data = errorState; // Important: Update ref data
        return errorState;
      }

      const newLocationState: LocationState = {
        status: 'ready',
        inPremises: result.inPremises,
        address: result.address || '',
        confidence: result.confidence || 'low',
        accuracy: result.accuracy || 0,
        coordinates: result.coordinates
          ? {
              lat: result.coordinates.lat,
              lng: result.coordinates.lng,
            }
          : undefined,
        error: null,
      };

      setLocationState(newLocationState);
      locationRef.current.data = newLocationState;
      locationRef.current.timestamp = now;
      locationRef.current.retryCount = 0;

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
            ? 'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น กรุณาเปิดการใช้งาน Location Services'
            : 'เกิดข้อผิดพลาดในการระบุตำแหน่ง',
      };
      setLocationState(errorState);
      locationRef.current.data = errorState; // Important: Update ref data
      return errorState;
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
