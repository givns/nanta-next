// hooks/useLocationVerification.ts
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import { LocationVerificationTriggers } from '@/services/location/LocationVerificationTriggers';
import {
  LocationStateContextType,
  LocationVerificationState,
  LocationTriggerConfig,
  INITIAL_STATE,
} from '@/types/attendance';

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

const useLocationVerification = (
  employeeId?: string,
  config: Partial<LocationTriggerConfig> = {},
): LocationStateContextType => {
  const [verificationState, setVerificationState] =
    useState<LocationVerificationState>(INITIAL_STATE);
  const stateRef = useRef<LocationVerificationState>(INITIAL_STATE);
  const previousStateRef = useRef<LocationVerificationState>(INITIAL_STATE);
  const triggerRef = useRef<LocationVerificationTriggers>();
  const isMounted = useRef(true);

  const {
    locationState,
    locationReady,
    getCurrentLocation,
    isLoading: locationLoading,
  } = useEnhancedLocation();

  // Initialize triggers
  useEffect(() => {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    triggerRef.current = new LocationVerificationTriggers(mergedConfig);
    return () => {
      isMounted.current = false;
    };
  }, [config]);

  // Synchronous state update handler
  const updateVerificationState = useCallback(
    (
      updates: Partial<LocationVerificationState>,
      source: 'location' | 'verification' | 'admin',
    ) => {
      if (!isMounted.current) return;

      // Create next state with proper verification status
      const nextState: LocationVerificationState = {
        ...stateRef.current,
        ...updates,
        // Determine verification status
        verificationStatus: (() => {
          if (updates.status === 'error' || updates.error) {
            return 'needs_verification' as const;
          }
          if (updates.verificationStatus) {
            return updates.verificationStatus;
          }
          if (stateRef.current.verificationStatus === 'admin_pending') {
            return 'admin_pending' as const;
          }
          return stateRef.current.verificationStatus;
        })(),
        // Preserve admin state
        ...(stateRef.current.verificationStatus === 'admin_pending' && {
          adminRequestId: stateRef.current.adminRequestId,
        }),
      };

      // Update refs immediately
      stateRef.current = nextState;
      previousStateRef.current = stateRef.current;

      // Then update React state
      setVerificationState(nextState);

      console.log('Verification State Update:', {
        source,
        previous: previousStateRef.current,
        updates,
        next: nextState,
      });
    },
    [],
  );

  // Enhanced location state handler
  useEffect(() => {
    if (!locationState || locationState === previousStateRef.current) return;

    console.group('📍 Location State Processing');
    console.log('Raw Location State:', locationState);

    // Handle error states first and synchronously
    if (
      locationState instanceof GeolocationPositionError ||
      locationState.status === 'error' ||
      locationState.error
    ) {
      const errorState: LocationVerificationState = {
        status: 'error',
        verificationStatus: 'needs_verification',
        inPremises: false,
        address: locationState.address || '',
        confidence: locationState.confidence || 'low',
        accuracy: locationState.accuracy || 0,
        coordinates: locationState.coordinates,
        error: locationState.error || 'ไม่สามารถระบุตำแหน่งได้',
        triggerReason: locationState.error?.includes('ถูกปิดกั้น')
          ? 'Location permission denied'
          : locationState.triggerReason || 'Location error',
      };

      // Update state synchronously
      updateVerificationState(errorState, 'location');
      console.log('Error State Set:', errorState);
      console.groupEnd();
      return;
    }

    // Handle other state updates
    updateVerificationState(
      {
        ...locationState,
        verificationStatus:
          locationState.status === 'ready' && locationState.inPremises
            ? 'verified'
            : locationState.status === 'ready'
              ? 'needs_verification'
              : 'pending',
      },
      'location',
    );

    console.groupEnd();
  }, [locationState, updateVerificationState]);

  // Debug logging
  useEffect(() => {
    console.log('Location State Change:', {
      status: stateRef.current.status,
      error: stateRef.current.error,
      verificationStatus: stateRef.current.verificationStatus,
      triggerReason: stateRef.current.triggerReason,
    });
  }, [stateRef.current]);

  // Verify location handler
  const verifyLocation = useCallback(
    async (force = false) => {
      if (!triggerRef.current) return false;

      try {
        updateVerificationState(
          {
            status: 'loading',
            error: null,
            verificationStatus: 'pending',
          },
          'verification',
        );

        const location = await getCurrentLocation(force);

        if (location.status === 'error' || location.error) {
          const trigger =
            triggerRef.current.shouldTriggerAdminAssistance(location);
          updateVerificationState(
            {
              ...location,
              status: 'error',
              verificationStatus: 'needs_verification',
              triggerReason: trigger.reason,
            },
            'verification',
          );
          return false;
        }

        updateVerificationState(
          {
            ...location,
            status: 'ready',
            verificationStatus: location.inPremises
              ? 'verified'
              : 'needs_verification',
          },
          'verification',
        );

        return location.inPremises;
      } catch (error) {
        console.error('Location verification error:', error);
        updateVerificationState(
          {
            status: 'error',
            verificationStatus: 'needs_verification',
            error:
              error instanceof Error
                ? error.message
                : 'Location verification failed',
            triggerReason: 'Unexpected error during verification',
          },
          'verification',
        );
        return false;
      }
    },
    [getCurrentLocation, updateVerificationState],
  );

  // Admin assistance handler
  const requestAdminAssistance = useCallback(async () => {
    if (!employeeId) return;

    try {
      updateVerificationState(
        {
          status: 'pending_admin',
          verificationStatus: 'admin_pending',
        },
        'admin',
      );

      const response = await fetch('/api/admin/location-assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          coordinates: stateRef.current.coordinates,
          address: stateRef.current.address,
          accuracy: stateRef.current.accuracy,
          timestamp: new Date().toISOString(),
          reason: stateRef.current.triggerReason,
        }),
      });

      if (!response.ok) throw new Error('Failed to request admin assistance');

      const data = await response.json();
      updateVerificationState(
        {
          status: 'waiting_admin',
          verificationStatus: 'admin_pending',
          adminRequestId: data.requestId,
        },
        'admin',
      );
    } catch (error) {
      updateVerificationState(
        {
          status: 'error',
          verificationStatus: 'needs_verification',
          error: 'Failed to request admin assistance',
        },
        'admin',
      );
      throw error;
    }
  }, [employeeId, updateVerificationState]);

  // Return memoized state context
  return useMemo(
    () => ({
      locationState: stateRef.current, // Use ref for immediate updates
      isLoading: locationLoading || stateRef.current.status === 'loading',
      needsVerification:
        stateRef.current.status === 'error' ||
        stateRef.current.verificationStatus === 'needs_verification',
      isVerified: stateRef.current.verificationStatus === 'verified',
      isAdminPending: stateRef.current.verificationStatus === 'admin_pending',
      triggerReason: stateRef.current.triggerReason,
      verifyLocation,
      requestAdminAssistance,
    }),
    [locationLoading, stateRef.current, verifyLocation, requestAdminAssistance],
  );
};

export default useLocationVerification;
