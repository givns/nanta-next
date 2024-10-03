// hooks/useSimpleAttendance.ts
import { useCallback, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
} from '../types/attendance';
import { UserData } from '../types/user';

export const useSimpleAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
): AttendanceHookReturn => {
  const [attendanceStatus] = useState(initialAttendanceStatus);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationError, setLocationError] = useState<string | null>(null);

  const getCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return null;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 0,
            enableHighAccuracy: true,
          });
        },
      );

      const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      setLocation(newLocation);
      setLocationError(null);
      return newLocation;
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError(
        'Unable to get precise location. Please enable location services and try again.',
      );
      setLocation(null);
      return null;
    }
  }, []);
  console.log('useSimpleAttendance called with:', {
    userData,
    initialAttendanceStatus,
  });

  return {
    attendanceStatus,
    isLoading: false,
    error: null,
    location,
    locationError,
    getCurrentLocation,
    effectiveShift: null,
    address: '',
    inPremises: false,
    isOutsideShift: false,
    checkInOut: async () => {},
    checkInOutAllowance: { allowed: true },
    fetchCheckInOutAllowance: async () => {},
    refreshAttendanceStatus: async () => attendanceStatus,
    isSubmitting: false,
  };
};
