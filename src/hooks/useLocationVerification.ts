import { useState, useCallback, useEffect, useRef } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import {
  LocationTriggerConfig,
  LocationVerificationTriggers,
} from '../services/location/LocationVerificationTriggers';
import {
  LocationVerificationState,
  LocationStateContextType,
  VerificationStatus,
} from '../types/attendance';

const INITIAL_STATE: LocationVerificationState = {
  status: 'initializing',
  verificationStatus: 'pending',
  inPremises: false,
  address: '',
  confidence: 'low',
  accuracy: 0,
  error: null,
};

const DEFAULT_CONFIG: LocationTriggerConfig = {
  maxAccuracy: 100,
  maxRetries: 3,
  maxWaitTime: 30000,
  minDistance: 200,
  workplaceCoordinates: [
    { lat: 13.50821, lng: 100.76405 },
    { lat: 13.51444, lng: 100.70922 },
    { lat: 13.747920392683099, lng: 100.63441771348242 },
  ],
};

export function useLocationVerification(
  employeeId?: string,
  config: Partial<LocationTriggerConfig> = {},
): LocationStateContextType {
  const [verificationState, setVerificationState] =
    useState<LocationVerificationState>(INITIAL_STATE);
  const triggerRef = useRef<LocationVerificationTriggers>();

  const {
    locationState,
    locationReady,
    getCurrentLocation,
    isLoading: locationLoading,
  } = useEnhancedLocation();

  // Initialize triggers with config
  useEffect(() => {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    triggerRef.current = new LocationVerificationTriggers(mergedConfig);
  }, [config]);

  // Handle location state updates
  useEffect(() => {
    // Skip if no location state
    if (!locationState) return;

    // Handle permission denied and location errors
    if (
      locationState.error?.includes('permission denied') ||
      locationState.error?.includes('ถูกปิดกั้น')
    ) {
      setVerificationState({
        ...locationState,
        status: 'error',
        verificationStatus: 'needs_verification' as VerificationStatus,
        error: locationState.error,
        triggerReason: 'Location permission denied',
      });
      return;
    }

    // Handle other errors if triggers available
    if (
      triggerRef.current &&
      (locationState.status === 'error' || locationState.error)
    ) {
      const trigger =
        triggerRef.current.shouldTriggerAdminAssistance(locationState);
      setVerificationState({
        ...locationState,
        status: 'error',
        verificationStatus: 'needs_verification' as VerificationStatus,
        error: locationState.error,
        triggerReason: trigger.reason,
      });
      return;
    }

    // Handle success state
    if (locationState.status === 'ready') {
      setVerificationState({
        ...locationState,
        verificationStatus: 'verified' as VerificationStatus,
        error: null,
        triggerReason: null,
      });
      return;
    }

    // Pass through loading state
    setVerificationState((prev) => ({
      ...locationState,
      verificationStatus:
        locationState.status === 'loading'
          ? prev.verificationStatus
          : ('pending' as VerificationStatus),
    }));
  }, [locationState]);

  const verifyLocation = useCallback(
    async (force = false) => {
      if (!triggerRef.current) return false;

      try {
        setVerificationState((prev) => ({
          ...prev,
          status: 'loading',
          error: null,
          verificationStatus: 'pending' as VerificationStatus,
        }));

        const location = await getCurrentLocation(force);

        if (location.status === 'error' || location.error) {
          const trigger =
            triggerRef.current.shouldTriggerAdminAssistance(location);
          setVerificationState((prev) => ({
            ...prev,
            status: 'error',
            verificationStatus: 'needs_verification' as VerificationStatus,
            error: location.error,
            triggerReason: trigger.reason,
          }));
          return false;
        }

        return location.inPremises;
      } catch (error) {
        console.error('Location verification error:', error);
        setVerificationState((prev) => ({
          ...prev,
          status: 'error',
          verificationStatus: 'needs_verification' as VerificationStatus,
          error:
            error instanceof Error
              ? error.message
              : 'Location verification failed',
          triggerReason: 'Unexpected error during location verification',
        }));
        return false;
      }
    },
    [getCurrentLocation],
  );

  const requestAdminAssistance = useCallback(async () => {
    if (!employeeId) return;

    try {
      setVerificationState((prev) => ({
        ...prev,
        status: 'pending_admin',
        verificationStatus: 'admin_pending' as VerificationStatus,
      }));

      const response = await fetch('/api/admin/location-assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          coordinates: verificationState.coordinates,
          address: verificationState.address,
          accuracy: verificationState.accuracy,
          timestamp: new Date().toISOString(),
          reason: verificationState.triggerReason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to request admin assistance');
      }

      const data = await response.json();

      setVerificationState((prev) => ({
        ...prev,
        status: 'waiting_admin',
        verificationStatus: 'admin_pending' as VerificationStatus,
        adminRequestId: data.requestId,
      }));
    } catch (error) {
      setVerificationState((prev) => ({
        ...prev,
        status: 'error',
        verificationStatus: 'needs_verification' as VerificationStatus,
        error: 'Failed to request admin assistance',
      }));
      throw error;
    }
  }, [employeeId, verificationState]);

  return {
    locationState: verificationState,
    isLoading: locationLoading || verificationState.status === 'loading',
    needsVerification:
      verificationState.status === 'error' ||
      verificationState.verificationStatus === 'needs_verification',
    isVerified: verificationState.verificationStatus === 'verified',
    isAdminPending: verificationState.verificationStatus === 'admin_pending',
    triggerReason: verificationState.triggerReason,
    verifyLocation,
    requestAdminAssistance,
  };
}
