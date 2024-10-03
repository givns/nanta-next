// hooks/useSimpleAttendance.ts
import { useCallback, useEffect, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
  CheckInOutAllowance,
} from '../types/attendance';
import { UserData } from '../types/user';
import axios from 'axios';

export const useSimpleAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
): AttendanceHookReturn => {
  const [attendanceStatus] = useState(initialAttendanceStatus);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [checkInOutAllowance, setCheckInOutAllowance] =
    useState<CheckInOutAllowance | null>(null);

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

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  const fetchCheckInOutAllowance = useCallback(async () => {
    console.log('Fetching check-in/out allowance'); // Debug log

    const currentLocation = await getCurrentLocation();
    if (!currentLocation) {
      setCheckInOutAllowance({
        allowed: false,
        reason: 'Location not available',
      });
      return;
    }
    // Check if location has changed significantly (e.g., more than 10 meters)
    const hasLocationChangedSignificantly = (
      prevLocation: { lat: number; lng: number } | null,
      newLocation: { lat: number; lng: number },
    ) => {
      if (!prevLocation) return true;
      const R = 6371e3; // Earth's radius in meters
      const dLat = ((newLocation.lat - prevLocation.lat) * Math.PI) / 180;
      const dLon = ((newLocation.lng - prevLocation.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((prevLocation.lat * Math.PI) / 180) *
          Math.cos((newLocation.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      return distance > 10; // 10 meters threshold
    };

    if (!hasLocationChangedSignificantly(location, currentLocation)) {
      return; // Don't refetch if location hasn't changed significantly
    }

    try {
      const response = await axios.get<CheckInOutAllowance>(
        '/api/attendance/allowed',
        {
          params: {
            employeeId: userData.employeeId,
            lat: currentLocation.lat,
            lng: currentLocation.lng,
          },
        },
      );
      setCheckInOutAllowance(response.data);
      setLocation(currentLocation); // Update stored location
    } catch (error) {
      console.error('Error checking if check-in/out is allowed:', error);
      setCheckInOutAllowance({
        allowed: false,
        reason: 'Error checking permissions',
      });
    }
  }, [userData.employeeId, getCurrentLocation]);

  useEffect(() => {
    console.log('Setting up check-in/out allowance fetch interval'); // Debug log
    fetchCheckInOutAllowance();
    const intervalId = setInterval(fetchCheckInOutAllowance, 60000);
    return () => clearInterval(intervalId);
  }, [fetchCheckInOutAllowance]);

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
    checkInOutAllowance,
    fetchCheckInOutAllowance,
    refreshAttendanceStatus: async () => attendanceStatus,
    isSubmitting: false,
  };
};
