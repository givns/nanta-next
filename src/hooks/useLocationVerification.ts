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
  const triggerRef = useRef<LocationVerificationTriggers>();
  const previousStateRef = useRef<LocationVerificationState>(INITIAL_STATE);
  const isMounted = useRef(true);

  const {
    locationState,
    locationReady,
    getCurrentLocation,
    isLoading: locationLoading,
  } = useEnhancedLocation();

  // Initialization effect remains same
  useEffect(() => {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    triggerRef.current = new LocationVerificationTriggers(mergedConfig);
    return () => {
      isMounted.current = false;
    };
  }, [config]);

  // State update handler - consolidate all state updates here
  const updateVerificationState = useCallback(
    (
      updates: Partial<LocationVerificationState>,
      source: 'location' | 'verification' | 'admin',
    ) => {
      if (!isMounted.current) return;

      setVerificationState((prev) => {
        const nextState: LocationVerificationState = {
          ...prev,
          ...updates,
          // Force verification status for error states
          verificationStatus: (() => {
            if (updates.status === 'error' || updates.error) {
              return 'needs_verification' as const;
            }
            if (updates.verificationStatus) {
              return updates.verificationStatus;
            }
            if (prev.verificationStatus === 'admin_pending') {
              return 'admin_pending' as const;
            }
            return prev.verificationStatus;
          })(),
          // Preserve admin state
          ...(prev.verificationStatus === 'admin_pending' && {
            adminRequestId: prev.adminRequestId,
          }),
        };

        console.log('State Update:', {
          source,
          previous: prev,
          updates,
          next: nextState,
        });

        // Update refs synchronously
        stateRef.current = nextState;
        previousStateRef.current = prev;
        return nextState;
      });
    },
    [],
  );

  // Location state handler
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
          : locationState.triggerReason || 'Unknown error',
      };

      setVerificationState(errorState);
      stateRef.current = errorState;
      previousStateRef.current = locationState;

      console.log('Error State Set:', errorState);
      console.groupEnd();
      return;
    }

    // Other state updates
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

  const stateDebugger = useCallback(
    (state: LocationVerificationState, label: string) => {
      console.group(`🔍 Location State Debug: ${label}`);
      console.log('Current State:', {
        status: state.status,
        error: state.error,
        verificationStatus: state.verificationStatus,
        triggerReason: state.triggerReason,
      });
      console.groupEnd();
    },
    [],
  );

  useEffect(() => {
    stateDebugger(stateRef.current, 'StateRef Update');
  }, [stateRef.current, stateDebugger]);

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

  // Return values with proper state reflection
  return useMemo(() => {
    const currentState = stateRef.current;
    return {
      locationState: currentState,
      isLoading: locationLoading || currentState.status === 'loading',
      needsVerification:
        currentState.status === 'error' ||
        currentState.verificationStatus === 'needs_verification',
      isVerified: currentState.verificationStatus === 'verified',
      isAdminPending: currentState.verificationStatus === 'admin_pending',
      triggerReason: currentState.triggerReason,
      verifyLocation,
      requestAdminAssistance,
    };
  }, [
    locationLoading,
    stateRef.current,
    verifyLocation,
    requestAdminAssistance,
  ]);
};

export default useLocationVerification;
