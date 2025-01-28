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
        // Prepare detailed log object
        const logEntry = {
          timestamp: new Date().toISOString(),
          source,
          previous: {
            triggerReason: prev.triggerReason,
            status: prev.status,
            verificationStatus: prev.verificationStatus,
            error: prev.error,
          },
          updates: {
            triggerReason: updates.triggerReason,
            status: updates.status,
            verificationStatus: updates.verificationStatus,
            error: updates.error,
          },
          stack: new Error().stack, // Capture call stack
        };

        // Create next state
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

        // Extended logging
        console.group(`🔍 Location State Update: ${source}`);
        console.log('Previous State:', logEntry.previous);
        console.log('Update Details:', logEntry.updates);
        console.log('Trigger Reason Changes:', {
          from: prev.triggerReason,
          to: next.triggerReason,
        });

        // Log stack trace to understand where the update is coming from
        if (prev.triggerReason !== next.triggerReason) {
          console.trace('Trigger Reason Stack Trace');
        }

        console.groupEnd();

        // Optional: Add to a debug log if needed
        try {
          window.localStorage.setItem(
            'locationStateUpdateLog',
            JSON.stringify(logEntry),
          );
        } catch (e) {
          console.warn('Could not log to localStorage', e);
        }

        stateRef.current = next;
        previousStateRef.current = prev;
        return next;
      });
    },
    [],
  );

  // Enhanced location state handler
  // Enhanced location state handler
  useEffect(() => {
    if (!locationState || locationState === previousStateRef.current) return;

    console.group('📍 Location State Processing');
    console.log('Raw Location State:', locationState);

    // GeolocationPositionError handling
    if (locationState instanceof GeolocationPositionError) {
      console.log('🚨 GeolocationPositionError Detected', {
        code: locationState.code,
        message: locationState.message,
      });

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
      console.groupEnd();
      return;
    }

    // Error state handling
    if (locationState.status === 'error' || locationState.error) {
      const trigger =
        triggerRef.current?.shouldTriggerAdminAssistance(locationState);

      console.log('🔴 Error State Detected', {
        status: locationState.status,
        error: locationState.error,
        adminTrigger: trigger,
      });

      updateVerificationState(
        {
          ...locationState,
          status: 'error',
          verificationStatus: 'needs_verification',
          error: locationState.error,
          triggerReason:
            trigger?.reason ||
            locationState.triggerReason ||
            'Unspecified error',
        },
        'location',
      );
      console.groupEnd();
      return;
    }

    // Success state handling
    if (locationState.status === 'ready') {
      console.log('✅ Location Ready State', {
        inPremises: locationState.inPremises,
      });

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

    // Default state handling
    console.log('⏳ Default State Handling', locationState);
    updateVerificationState(
      {
        ...locationState,
        verificationStatus: locationState.verificationStatus || 'pending',
      },
      'location',
    );
    console.groupEnd();
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
