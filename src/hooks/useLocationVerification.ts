import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import {
  LocationTriggerConfig,
  LocationVerificationTriggers,
} from '../services/location/LocationVerificationTriggers';
import {
  LocationStateContextType,
  LocationVerificationState,
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
  const stateRef = useRef<LocationVerificationState>(INITIAL_STATE);
  const triggerRef = useRef<LocationVerificationTriggers>();
  const previousStateRef = useRef<LocationVerificationState>(INITIAL_STATE);

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

  // Consolidated state update function
  const updateVerificationState = useCallback(
    (
      updates: Partial<LocationVerificationState>,
      source: 'location' | 'verification' | 'admin',
    ) => {
      setVerificationState((prev) => {
        const next = {
          ...prev,
          ...updates,
          // Preserve admin state if it exists and we're not explicitly updating it
          ...(prev.verificationStatus === 'admin_pending' &&
            !updates.verificationStatus && {
              verificationStatus: prev.verificationStatus,
              adminRequestId: prev.adminRequestId,
            }),
        };

        // Log state transition if significant changes occurred
        if (JSON.stringify(prev) !== JSON.stringify(next)) {
          console.log(`State update from ${source}:`, {
            previous: prev,
            next,
            updates,
          });
        }

        stateRef.current = next;
        previousStateRef.current = prev;
        return next;
      });
    },
    [],
  );

  // Enhanced location state handler
  useEffect(() => {
    if (!locationState || locationState === previousStateRef.current) return;

    console.log('Processing location state update:', locationState);

    if (locationState instanceof GeolocationPositionError) {
      updateVerificationState(
        {
          status: 'error',
          verificationStatus: 'needs_verification',
          error:
            locationState.code === GeolocationPositionError.PERMISSION_DENIED
              ? 'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น'
              : 'ไม่สามารถระบุตำแหน่งได้',
          triggerReason: 'Location permission denied',
        },
        'location',
      );
      return;
    }

    // Handle error states
    if (locationState.status === 'error' || locationState.error) {
      const trigger =
        triggerRef.current?.shouldTriggerAdminAssistance(locationState);
      updateVerificationState(
        {
          ...locationState,
          status: 'error',
          verificationStatus: 'needs_verification',
          error: locationState.error,
          triggerReason: trigger?.reason || locationState.triggerReason,
        },
        'location',
      );
      return;
    }

    // Handle success states
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
      return;
    }

    // Handle all other states
    updateVerificationState(
      {
        ...locationState,
        verificationStatus: locationState.verificationStatus || 'pending',
      },
      'location',
    );
  }, [locationState, updateVerificationState]);

  // Verification handler
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
