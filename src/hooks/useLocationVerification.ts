import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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

  useEffect(() => {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    triggerRef.current = new LocationVerificationTriggers(mergedConfig);
  }, [config]);

  // Track verification state changes
  useEffect(() => {
    console.log('Verification state changed:', verificationState);
  }, [verificationState]);

  // Location state change handler with improved state preservation
  useEffect(() => {
    console.log('Raw location state update:', locationState);

    setVerificationState((prev) => {
      // Handle permission denied errors with state preservation
      if (
        locationState.error?.includes('permission denied') ||
        locationState.error?.includes('ถูกปิดกั้น')
      ) {
        return {
          ...locationState,
          status: 'error',
          verificationStatus: 'needs_verification',
          error: locationState.error,
          triggerReason: 'Location permission denied',
          // Preserve previous verification state if needed
          ...(prev.verificationStatus === 'admin_pending' && {
            verificationStatus: prev.verificationStatus,
            adminRequestId: prev.adminRequestId,
          }),
        };
      }

      // Handle other errors with triggers and state preservation
      if (
        triggerRef.current &&
        (locationState.status === 'error' || locationState.error)
      ) {
        const trigger =
          triggerRef.current.shouldTriggerAdminAssistance(locationState);
        return {
          ...locationState,
          status: 'error',
          verificationStatus: 'needs_verification',
          error: locationState.error,
          triggerReason: trigger.reason,
          // Preserve admin state if exists
          ...(prev.verificationStatus === 'admin_pending' && {
            verificationStatus: prev.verificationStatus,
            adminRequestId: prev.adminRequestId,
          }),
        };
      }

      // Handle success state
      if (locationState.status === 'ready') {
        return {
          ...locationState,
          verificationStatus: 'verified',
          error: null,
          triggerReason: null,
        };
      }

      // Default state handling - preserve verification status
      return {
        ...locationState,
        verificationStatus:
          locationState.status === 'loading'
            ? prev.verificationStatus
            : prev.verificationStatus || 'pending',
        triggerReason: prev.triggerReason,
        adminRequestId: prev.adminRequestId,
      };
    });
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

        if (location.status === 'error' || location.error) {
          const trigger =
            triggerRef.current.shouldTriggerAdminAssistance(location);
          setVerificationState((prev) => ({
            ...prev,
            status: 'error',
            verificationStatus: 'needs_verification',
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

  return useMemo(
    () => ({
      locationState: verificationState,
      isLoading: locationLoading || verificationState.status === 'loading',
      needsVerification:
        verificationState.verificationStatus === 'needs_verification',
      isVerified: verificationState.verificationStatus === 'verified',
      isAdminPending: verificationState.verificationStatus === 'admin_pending',
      triggerReason: verificationState.triggerReason,
      verifyLocation,
      requestAdminAssistance,
    }),
    [
      verificationState,
      locationLoading,
      verifyLocation,
      requestAdminAssistance,
    ],
  );
}
