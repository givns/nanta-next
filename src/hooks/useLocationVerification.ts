// hooks/useLocationVerification.ts
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
  maxAccuracy: 100, // Maximum acceptable accuracy in meters
  maxRetries: 3, // Maximum number of location fetch retries
  maxWaitTime: 30000, // Maximum wait time in milliseconds
  minDistance: 200, // Minimum distance from workplace in meters
  workplaceCoordinates: [
    {
      lat: 13.50821,
      lng: 100.76405,
    },
    {
      lat: 13.51444,
      lng: 100.70922,
    },
    {
      lat: 13.747920392683099,
      lng: 100.63441771348242,
    },
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

  // Initialize triggers with merged config
  useEffect(() => {
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    triggerRef.current = new LocationVerificationTriggers(mergedConfig);
  }, [config]);

  // Sync location state with verification state
  useEffect(() => {
    console.log('Location state update:', locationState);

    // Handle permission denied case explicitly
    if (
      locationState.error?.includes('permission denied') ||
      locationState.error?.includes('ถูกปิดกั้น')
    ) {
      setVerificationState((prev) => ({
        ...prev,
        status: 'error',
        verificationStatus: 'needs_verification',
        error: locationState.error,
        triggerReason: 'Location permission denied',
      }));
      return;
    }

    // Handle other error states
    if (locationState.status === 'error' || locationState.error) {
      setVerificationState((prev) => ({
        ...prev,
        status: 'error',
        verificationStatus: 'needs_verification',
        error: locationState.error,
        triggerReason: locationState.error,
      }));
      return;
    }

    // Update normal state
    setVerificationState((prev) => ({
      ...prev,
      ...locationState,
      verificationStatus:
        locationState.status === 'ready' ? 'verified' : 'pending',
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
          verificationStatus: 'pending',
        }));

        const location = await getCurrentLocation(force);

        // Handle error cases
        if (location.status === 'error' || location.error) {
          const triggerCheck =
            triggerRef.current.shouldTriggerAdminAssistance(location);
          setVerificationState((prev) => ({
            ...prev,
            status: 'error',
            verificationStatus: 'needs_verification',
            error: location.error,
            triggerReason: triggerCheck.reason,
          }));
          return false;
        }

        return location.inPremises;
      } catch (error) {
        console.error('Location verification error:', error);
        setVerificationState((prev) => ({
          ...prev,
          status: 'error',
          verificationStatus: 'needs_verification',
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
        verificationStatus: 'admin_pending',
      }));

      // Make the API call
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
        verificationStatus: 'admin_pending',
        adminRequestId: data.requestId,
      }));
    } catch (error) {
      setVerificationState((prev) => ({
        ...prev,
        status: 'error',
        verificationStatus: 'needs_verification',
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
