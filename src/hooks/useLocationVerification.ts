// hooks/useLocationVerification.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import {
  LocationVerificationTriggers,
  LocationTriggerConfig,
} from '../services/location/LocationVerificationTriggers';
import {
  LocationVerificationState,
  LocationStateContextType,
} from '../types/attendance';

const DEFAULT_CONFIG: LocationTriggerConfig = {
  maxAccuracy: 100,
  maxRetries: 3,
  maxWaitTime: 30000,
  minDistance: 200,
  workplaceCoordinates: [{ lat: 13.7563, lng: 100.5018 }],
};

const INITIAL_STATE: LocationVerificationState = {
  status: 'initializing',
  verificationStatus: 'pending',
  inPremises: false,
  address: '',
  confidence: 'low',
  accuracy: 0,
  error: null,
};

export function useLocationVerification(
  employeeId?: string,
  config: Partial<LocationTriggerConfig> = {},
): LocationStateContextType {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
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
    if (locationState.error) {
      setVerificationState((prev) => ({
        ...prev,
        status: 'error',
        error: locationState.error,
        verificationStatus: 'needs_verification',
      }));
    } else if (locationState.status === 'ready') {
      setVerificationState((prev) => ({
        ...prev,
        ...locationState,
        verificationStatus: locationState.inPremises
          ? 'verified'
          : 'needs_verification',
      }));
    }
  }, [locationState]);

  useEffect(() => {
    triggerRef.current = new LocationVerificationTriggers(finalConfig);
  }, [finalConfig]);

  const verifyLocation = useCallback(
    async (force = false) => {
      if (!triggerRef.current) return false;

      try {
        // Set loading state first
        setVerificationState((prev) => ({
          ...prev,
          status: 'loading',
          error: null,
          verificationStatus: 'pending',
        }));

        const location = await getCurrentLocation(force);

        const { shouldTrigger, reason } =
          triggerRef.current.shouldTriggerAdminAssistance(location);

        if (shouldTrigger) {
          setVerificationState((prev) => ({
            ...prev,
            ...location,
            status: 'ready',
            verificationStatus: 'needs_verification',
            triggerReason: reason,
          }));
          return false;
        }

        setVerificationState((prev) => ({
          ...prev,
          ...location,
          status: 'ready',
          verificationStatus: location.inPremises
            ? 'verified'
            : 'needs_verification',
          lastVerifiedAt: new Date(),
          triggerReason: undefined,
        }));

        return location.inPremises;
      } catch (error) {
        triggerRef.current.incrementRetry();

        // Handle specific Geolocation errors
        if (error instanceof GeolocationPositionError) {
          switch (error.code) {
            case GeolocationPositionError.PERMISSION_DENIED:
              setVerificationState((prev) => ({
                ...prev,
                status: 'error',
                verificationStatus: 'needs_verification',
                error:
                  'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น กรุณาเปิดการใช้งาน Location Services',
                triggerReason: 'Location permission denied',
              }));
              break;
            case GeolocationPositionError.POSITION_UNAVAILABLE:
              setVerificationState((prev) => ({
                ...prev,
                status: 'error',
                verificationStatus: 'needs_verification',
                error: 'ไม่สามารถระบุตำแหน่งได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
                triggerReason: 'Location unavailable',
              }));
              break;
            case GeolocationPositionError.TIMEOUT:
              setVerificationState((prev) => ({
                ...prev,
                status: 'error',
                verificationStatus: 'needs_verification',
                error: 'หมดเวลาในการค้นหาตำแหน่ง กรุณาลองใหม่อีกครั้ง',
                triggerReason: 'Location timeout',
              }));
              break;
            default:
              setVerificationState((prev) => ({
                ...prev,
                status: 'error',
                verificationStatus: 'needs_verification',
                error: 'เกิดข้อผิดพลาดในการระบุตำแหน่ง กรุณาลองใหม่อีกครั้ง',
                triggerReason: 'Location error',
              }));
          }
        } else {
          // Handle other errors
          setVerificationState((prev) => ({
            ...prev,
            status: 'error',
            verificationStatus: 'needs_verification',
            error:
              error instanceof Error
                ? error.message
                : 'Failed to verify location',
            triggerReason: 'Location verification failed',
          }));
        }
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

      startAdminResponsePolling(data.requestId);
    } catch (error) {
      setVerificationState((prev) => ({
        ...prev,
        status: 'error',
        verificationStatus: 'needs_verification',
        error: 'Failed to request admin assistance',
      }));
      throw error;
    }
  }, [
    employeeId,
    verificationState.coordinates,
    verificationState.address,
    verificationState.accuracy,
    verificationState.triggerReason,
  ]);

  const startAdminResponsePolling = useCallback((requestId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/admin/location-assistance/${requestId}`,
        );
        if (!response.ok) throw new Error('Failed to check admin response');

        const data = await response.json();
        if (data.status === 'approved') {
          setVerificationState((prev) => ({
            ...prev,
            status: 'ready',
            verificationStatus: 'verified',
            lastVerifiedAt: new Date(),
            inPremises: true,
          }));
          clearInterval(pollInterval);
        } else if (data.status === 'rejected') {
          setVerificationState((prev) => ({
            ...prev,
            status: 'error',
            verificationStatus: 'needs_verification',
            error: data.reason || 'Location verification rejected',
          }));
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling admin response:', error);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  return {
    locationState: verificationState,
    isLoading: locationLoading || verificationState.status === 'loading',
    needsVerification:
      verificationState.verificationStatus === 'needs_verification',
    isVerified: verificationState.verificationStatus === 'verified',
    isAdminPending: verificationState.verificationStatus === 'admin_pending',
    triggerReason: verificationState.triggerReason,
    verifyLocation,
    requestAdminAssistance,
  };
}
