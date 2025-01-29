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
  VerificationStatus,
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
        // Determine the verification status with proper type handling
        let verificationStatus: VerificationStatus = 'pending'; // Default value

        if (updates.status === 'error') {
          verificationStatus = 'needs_verification';
        } else if (updates.verificationStatus) {
          verificationStatus = updates.verificationStatus;
        } else if (prev.verificationStatus === 'admin_pending') {
          verificationStatus = 'admin_pending';
        }

        // Create the next state with explicit verification status
        const nextState: LocationVerificationState = {
          ...prev,
          ...updates,
          verificationStatus, // Now this is guaranteed to be VerificationStatus
          // Preserve admin ID if needed
          ...(verificationStatus === 'admin_pending' && {
            adminRequestId: prev.adminRequestId,
          }),
        };

        // Rest of the function remains the same...
        if (updates.status && updates.status !== prev.status) {
          if (
            !validateStateTransition(prev.status, updates.status, nextState)
          ) {
            console.warn('Invalid state transition, keeping previous state');
            return prev;
          }
        }

        console.group(`🔍 Location State Update: ${source}`);
        console.log('Previous State:', {
          status: prev.status,
          verificationStatus: prev.verificationStatus,
          triggerReason: prev.triggerReason,
        });
        console.log('Updates:', updates);
        console.log('Next State:', {
          status: nextState.status,
          verificationStatus: nextState.verificationStatus,
          triggerReason: nextState.triggerReason,
        });
        console.groupEnd();

        stateRef.current = nextState;
        previousStateRef.current = prev;
        return nextState;
      });
    },
    [validateStateTransition],
  );

  useEffect(() => {
    if (!locationState || locationState === previousStateRef.current) return;

    console.group('📍 Location State Processing');
    console.log('Raw Location State:', locationState);

    // Immediately handle GeolocationPositionError or error state
    if (
      locationState instanceof GeolocationPositionError ||
      locationState.status === 'error' ||
      locationState.error
    ) {
      const errorState: LocationVerificationState = {
        status: 'error',
        verificationStatus: 'needs_verification', // Force this
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

      console.log('Processing error state:', errorState);
      updateVerificationState(errorState, 'location');
      console.groupEnd();
      return;
    }

    // Handle ready state
    if (locationState.status === 'ready') {
      const isInPremises = Boolean(locationState.inPremises);
      updateVerificationState(
        {
          status: 'ready',
          verificationStatus: isInPremises ? 'verified' : 'needs_verification',
          inPremises: isInPremises,
          address: locationState.address || '',
          confidence: locationState.confidence || 'low',
          accuracy: locationState.accuracy || 0,
          coordinates: locationState.coordinates,
          error: null,
          triggerReason: isInPremises ? null : 'Out of premises',
        },
        'location',
      );
      console.groupEnd();
      return;
    }

    // Handle intermediate states (loading, initializing)
    updateVerificationState(
      {
        status: locationState.status,
        verificationStatus: 'pending',
        inPremises: false,
        address: locationState.address || '',
        confidence: locationState.confidence || 'low',
        accuracy: locationState.accuracy || 0,
        coordinates: locationState.coordinates,
        error: null,
        triggerReason: null,
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
      locationState: {
        ...stateRef.current,
        // Ensure these fields are always present
        status: stateRef.current.status,
        verificationStatus: stateRef.current.verificationStatus,
        error: stateRef.current.error || null,
        triggerReason: stateRef.current.triggerReason || null,
        inPremises: stateRef.current.inPremises || false,
        address: stateRef.current.address || '',
        confidence: stateRef.current.confidence || 'low',
        accuracy: stateRef.current.accuracy || 0,
        coordinates: stateRef.current.coordinates,
      },
      isLoading: locationLoading || verificationState.status === 'loading',
      needsVerification: Boolean(
        verificationState.verificationStatus === 'needs_verification' ||
          verificationState.status === 'error',
      ),
      isVerified: verificationState.verificationStatus === 'verified',
      isAdminPending: verificationState.verificationStatus === 'admin_pending',
      triggerReason: verificationState.triggerReason || null,
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
