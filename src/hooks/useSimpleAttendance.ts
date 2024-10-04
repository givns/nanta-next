// hooks/useSimpleAttendance.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
  CheckInOutAllowance,
} from '../types/attendance';
import { UserData } from '../types/user';
import axios from 'axios';
import { AppErrors } from '@/utils/errorHandler';

interface Premise {
  lat: number;
  lng: number;
  radius: number;
  name: string;
}
const PREMISES: Premise[] = [
  { lat: 13.50821, lng: 100.76405, radius: 50, name: 'บริษัท นันตา ฟู้ด' },
  { lat: 13.51444, lng: 100.70922, radius: 50, name: 'บริษัท ปัตตานี ฟู้ด' },
  {
    lat: 13.747920392683099,
    lng: 100.63441771348242,
    radius: 50,
    name: 'สำนักงานใหญ่',
  },
];

export const useSimpleAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
): AttendanceHookReturn => {
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo>(initialAttendanceStatus);
  const [effectiveShift, setEffectiveShift] = useState(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [inPremises, setInPremises] = useState(false);
  const [isOutsideShift] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [checkInOutAllowance, setCheckInOutAllowance] =
    useState<CheckInOutAllowance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const processAttendanceStatus = useCallback(
    (status: AttendanceStatusInfo) => {
      console.log('Processing attendance status', status); // Debug log

      if (status.latestAttendance) {
        const {
          checkInTime,
          checkOutTime,
          status: attendanceStatus,
        } = status.latestAttendance;
        status.detailedStatus = attendanceStatus;
        status.isCheckingIn = !!checkInTime && !checkOutTime;
        if (!checkInTime && !checkOutTime) {
          status.isCheckingIn = true;
          status.detailedStatus = 'pending';
        } else if (checkInTime && !checkOutTime) {
          status.isCheckingIn = false;
          status.detailedStatus = 'checked-in';
        } else if (checkInTime && checkOutTime) {
          status.isCheckingIn = true;
          status.detailedStatus = 'checked-out';
        }
      }
      return status;
    },
    [],
  );

  useEffect(() => {
    console.log('Setting initial attendance status'); // Debug log
    setAttendanceStatus(processAttendanceStatus(initialAttendanceStatus));
  }, [initialAttendanceStatus, processAttendanceStatus]);

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const isWithinPremises = useCallback(
    (lat: number, lng: number): Premise | null => {
      const ERROR_MARGIN = 50; // 50 meters error margin
      for (const premise of PREMISES) {
        const distance = calculateDistance(lat, lng, premise.lat, premise.lng);
        if (distance <= premise.radius + ERROR_MARGIN) {
          return premise;
        }
      }
      return null;
    },
    [],
  );

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

      const premise = isWithinPremises(newLocation.lat, newLocation.lng);
      if (premise) {
        setAddress(premise.name);
        setInPremises(true);
      } else {
        setAddress('Unknown location');
        setInPremises(false);
      }

      return newLocation;
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError(
        'Unable to get precise location. Please enable location services and try again.',
      );
      setLocation(null);
      setAddress('');
      setInPremises(false);
      return null;
    }
  }, [isWithinPremises]);

  const fetchCheckInOutAllowance = useCallback(async () => {
    console.log('Fetching check-in/out allowance');
    setIsLoading(true);
    try {
      const currentLocation = await getCurrentLocation();
      if (!currentLocation) {
        setCheckInOutAllowance({
          allowed: false,
          reason: 'Location not available',
          inPremises,
          address,
        });
        return;
      }

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
    } catch (error) {
      console.error('Error checking if check-in/out is allowed:', error);
      setCheckInOutAllowance({
        allowed: false,
        reason: 'Error checking permissions',
        inPremises: false,
        address: 'Unknown location',
      });
    } finally {
      setIsLoading(false);
    }
  }, [userData.employeeId, getCurrentLocation]);

  useEffect(() => {
    console.log('Setting up check-in/out allowance fetch interval'); // Debug log
    fetchCheckInOutAllowance();
    const intervalId = setInterval(fetchCheckInOutAllowance, 60000);
    return () => clearInterval(intervalId);
  }, [fetchCheckInOutAllowance]);

  const getAttendanceStatus = useCallback(
    async (forceRefresh: boolean = false) => {
      console.log('Getting attendance status', { forceRefresh }); // Debug log
      try {
        setIsLoading(true);
        const currentLocation = await getCurrentLocation();
        const response = await axios.get(`/api/user-check-in-status`, {
          params: {
            lineUserId: userData.lineUserId,
            forceRefresh,
            lat: currentLocation?.lat,
            lng: currentLocation?.lng,
          },
        });
        const { attendanceStatus, effectiveShift } = response.data;
        setAttendanceStatus(processAttendanceStatus(attendanceStatus));
        setEffectiveShift(effectiveShift);
        return response.data;
      } catch (error) {
        console.error('Error fetching attendance status:', error);
        setError('Failed to fetch attendance status');
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [userData.lineUserId, processAttendanceStatus, getCurrentLocation],
  );

  useEffect(() => {
    console.log('Fetching initial data'); // Debug log
    getAttendanceStatus().catch((error) => {
      console.error('Error fetching initial data:', error);
      setError(
        error instanceof AppErrors
          ? error.message
          : 'An unexpected error occurred',
      );
    });
  }, [getAttendanceStatus]);

  console.log('useSimpleAttendance called with:', {
    userData,
    initialAttendanceStatus,
  });

  return {
    attendanceStatus,
    isLoading,
    error,
    location,
    locationError,
    getCurrentLocation,
    effectiveShift: null,
    address,
    inPremises,
    isOutsideShift,
    checkInOut: async () => {},
    checkInOutAllowance,
    fetchCheckInOutAllowance,
    isSubmitting: false,
  };
};
