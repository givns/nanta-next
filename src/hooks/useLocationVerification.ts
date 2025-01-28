// hooks/useLocationVerification.ts
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import { LocationVerificationTriggers } from '@/services/location/LocationVerificationTriggers';
import {
  LocationStateContextType,
  LocationVerificationState,
  LocationTriggerConfig,
  INITIAL_STATE,
  STATE_TRANSITIONS,
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

export function useLocationVerification(
  employeeId?: string,
  config: Partial<LocationTriggerConfig> = {},
): LocationStateContextType {
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

  useEffect(() => {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    triggerRef.current = new LocationVerificationTriggers(mergedConfig);
    return () => {
      isMounted.current = false;
    };
  }, [config]);

  const validateStateTransition = useCallback(
    (
      from: LocationVerificationState['status'],
      to: LocationVerificationState['status'],
      payload: Partial<LocationVerificationState>,
    ): boolean => {
      const transition = STATE_TRANSITIONS[from];
      if (!transition?.to.includes(to)) {
        console.warn(`Invalid transition from ${from} to ${to}`);
        return false;
      }

      const { requiredFields } = transition;
      const isValid = Object.entries(requiredFields).every(
        ([field, required]) =>
          !required ||
          payload[field as keyof LocationVerificationState] !== undefined,
      );

      if (!isValid) {
        console.warn(
          `Missing required fields for transition from ${from} to ${to}`,
          {
            required: requiredFields,
            provided: payload,
          },
        );
      }

      return isValid;
    },
    [],
  );

  const updateVerificationState = useCallback(
    (
      updates: Partial<LocationVerificationState>,
      source: 'location' | 'verification' | 'admin',
    ) => {
      if (!isMounted.current) return;

      setVerificationState((prev) => {
        // Validate state transition if status is changing
        if (updates.status && updates.status !== prev.status) {
          if (!validateStateTransition(prev.status, updates.status, updates)) {
            console.warn(
              'Invalid state transition attempted, keeping previous state',
            );
            return prev;
          }
        }

        console.group(`🔍 Location State Update: ${source}`);
        console.log('Previous State:', {
          triggerReason: prev.triggerReason,
          status: prev.status,
          verificationStatus: prev.verificationStatus,
          error: prev.error,
        });

        console.log('Update Details:', {
          triggerReason: updates.triggerReason,
          status: updates.status,
          verificationStatus: updates.verificationStatus,
          error: updates.error,
        });

        // Create next state
        const next = {
          ...prev,
          ...updates,
          // Preserve admin state if needed
          ...(prev.verificationStatus === 'admin_pending' &&
            !updates.verificationStatus && {
              verificationStatus: prev.verificationStatus,
              adminRequestId: prev.adminRequestId,
            }),
        };

        if (prev.triggerReason !== next.triggerReason) {
          console.log('Trigger Reason Changes:', {
            from: prev.triggerReason,
            to: next.triggerReason,
          });
        }

        console.groupEnd();

        // Update refs
        stateRef.current = next;
        previousStateRef.current = prev;
        return next;
      });
    },
    [validateStateTransition],
  );

  useEffect(() => {
    if (!locationState || locationState === previousStateRef.current) return;

    console.group('📍 Location State Processing');
    console.log('Raw Location State:', locationState);

    // Handle GeolocationPositionError
    if (locationState instanceof GeolocationPositionError) {
      updateVerificationState(
        {
          status: 'error',
          verificationStatus: 'needs_verification',
          error:
            locationState.code === 1
              ? 'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น'
              : 'ไม่สามารถระบุตำแหน่งได้',
          triggerReason: 'Location permission denied',
        },
        'location',
      );
      console.groupEnd();
      return;
    }

    // Handle error state
    if (locationState.status === 'error' || locationState.error) {
      const trigger =
        triggerRef.current?.shouldTriggerAdminAssistance(locationState);

      updateVerificationState(
        {
          ...locationState,
          status: 'error',
          verificationStatus: 'needs_verification',
          error: locationState.error,
          triggerReason: locationState.error?.includes('ถูกปิดกั้น')
            ? 'Location permission denied'
            : trigger?.reason || 'Location verification failed',
        },
        'location',
      );
      console.groupEnd();
      return;
    }

    // Handle ready state
    if (locationState.status === 'ready') {
      updateVerificationState(
        {
          ...locationState,
          verificationStatus: locationState.inPremises
            ? 'verified'
            : 'needs_verification',
          error: null,
          triggerReason: locationState.inPremises ? null : 'Out of premises',
        },
        'location',
      );
      console.groupEnd();
      return;
    }

    // Handle default state
    updateVerificationState(
      {
        ...locationState,
        verificationStatus: locationState.verificationStatus || 'pending',
      },
      'location',
    );
    console.groupEnd();
  }, [locationState, updateVerificationState]);

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

  return useMemo(
    () => ({
      locationState: stateRef.current,
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
      locationLoading,
      verificationState,
      verifyLocation,
      requestAdminAssistance,
    ],
  );
}
