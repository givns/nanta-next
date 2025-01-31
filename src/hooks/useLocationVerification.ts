// hooks/useLocationVerification.ts
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import { LocationVerificationTriggers } from '@/services/location/LocationVerificationTriggers';
import {
  LocationStateContextType,
  LocationVerificationState,
  LocationTriggerConfig,
  INITIAL_STATE,
  LocationStatus,
} from '@/types/attendance';

interface LocationVerificationOptions extends Partial<LocationTriggerConfig> {
  onAdminApproval?: () => Promise<void>;
}

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
  options: LocationVerificationOptions = {},
): LocationStateContextType & { resetAdminVerification?: () => void } => {
  const [verificationState, setVerificationState] =
    useState<LocationVerificationState>(INITIAL_STATE);
  const triggerRef = useRef<LocationVerificationTriggers>();
  const isMounted = useRef(true);
  const adminVerifiedRef = useRef<boolean>(false);

  const {
    locationState,
    locationReady,
    getCurrentLocation,
    isLoading: locationLoading,
  } = useEnhancedLocation();

  // Initialize triggers
  useEffect(() => {
    const mergedConfig = { ...DEFAULT_CONFIG, ...options };
    triggerRef.current = new LocationVerificationTriggers(mergedConfig);
    return () => {
      isMounted.current = false;
    };
  }, [options]);

  // Immediate location state update handler
  useEffect(() => {
    if (!locationState) return;

    console.group('📍 Location State Processing');
    console.log('Raw Location State:', locationState);

    // Handle error states immediately
    if (locationState.status === 'error' || locationState.error) {
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

      setVerificationState(errorState);
      console.log('Error State Set:', errorState);
      console.groupEnd();
      return;
    }

    // For non-error states
    setVerificationState({
      ...locationState,
      verificationStatus:
        locationState.status === 'ready' && locationState.inPremises
          ? 'verified'
          : locationState.status === 'ready'
            ? 'needs_verification'
            : 'pending',
    });

    console.groupEnd();
  }, [locationState]);

  // Verify location handler
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

        // Check for locked state first
        const lockedState = triggerRef.current.getLockedState();
        if (lockedState && !force) {
          setVerificationState(lockedState);
          return lockedState.inPremises;
        }

        const location = await getCurrentLocation(force);
        return location.inPremises;
      } catch (error) {
        console.error('Location verification error:', error);
        setVerificationState({
          status: 'error',
          verificationStatus: 'needs_verification',
          inPremises: false,
          address: '',
          confidence: 'low',
          accuracy: 0,
          error:
            error instanceof Error
              ? error.message
              : 'Location verification failed',
          triggerReason: 'Unexpected error during verification',
        });
        return false;
      }
    },
    [getCurrentLocation],
  );

  // Add handleAdminApproval function
  const handleAdminApproval = useCallback(async () => {
    if (!isMounted.current) return;

    try {
      // Create approved state
      const approvedState: LocationVerificationState = {
        status: 'ready',
        verificationStatus: 'verified',
        inPremises: true,
        error: null,
        coordinates: verificationState.coordinates,
        address: verificationState.address || '',
        confidence: 'high',
        accuracy: verificationState.accuracy || 0,
        adminRequestId: undefined,
        triggerReason: null,
      };

      // Update state
      setVerificationState(approvedState);

      // Lock the state in the location service
      if (triggerRef.current) {
        triggerRef.current.lockApprovedState(approvedState);
      }

      // Call the onAdminApproval callback if provided
      if (options.onAdminApproval) {
        await options.onAdminApproval();
      }
    } catch (error) {
      console.error('Error handling admin approval:', error);
    }
  }, [verificationState, options.onAdminApproval]);

  useEffect(() => {
    let pollTimer: NodeJS.Timeout | undefined; // Changed type to allow undefined
    let isProcessing = false; // Add flag to prevent multiple simultaneous processing

    const checkAdminRequestStatus = async () => {
      if (!verificationState.adminRequestId || isProcessing) return;

      try {
        isProcessing = true; // Set processing flag
        const response = await fetch(
          `/api/admin/location-assistance?requestId=${verificationState.adminRequestId}`,
        );
        if (!response.ok) return;

        const data = await response.json();
        console.log('Admin request status check:', data);

        if (data.status === 'APPROVED' && !adminVerifiedRef.current) {
          console.log(
            'Location request approved by admin, proceeding with attendance',
          );

          // Clear the polling timer immediately
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = undefined;
          }

          await handleAdminApproval();

          // Clear the adminRequestId after successful approval
          setVerificationState((prev) => ({
            ...prev,
            adminRequestId: undefined, // This is crucial
          }));
        }
      } catch (error) {
        console.error('Error checking admin request status:', error);
      } finally {
        isProcessing = false; // Clear processing flag
      }
    };

    // Only start polling if we have an adminRequestId and no active timer
    if (verificationState.adminRequestId && !pollTimer) {
      checkAdminRequestStatus(); // Initial check
      pollTimer = setInterval(checkAdminRequestStatus, 3000); // Start polling
    }

    return () => {
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [verificationState.adminRequestId, handleAdminApproval]);

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
          reason: verificationState.error || verificationState.triggerReason,
          source: 'web',
          metadata: {
            source: 'web',
            version: '1.0',
            device: {
              platform: 'web',
            },
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to request admin assistance');

      const data = await response.json();
      console.log('Admin request created:', data);

      setVerificationState((prev) => ({
        ...prev,
        status: 'waiting_admin',
        verificationStatus: 'admin_pending',
        adminRequestId: data.id,
      }));
    } catch (error) {
      console.error('Error requesting admin assistance:', error);
      setVerificationState((prev) => ({
        ...prev,
        status: 'error',
        verificationStatus: 'needs_verification',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to request admin assistance',
      }));
      throw error;
    }
  }, [employeeId, verificationState]);

  const resetAdminVerification = useCallback(() => {
    adminVerifiedRef.current = false;
  }, []);

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
    resetAdminVerification,
  };
};

export default useLocationVerification;
