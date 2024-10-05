// hooks/useSimpleAttendance.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
  CheckInOutAllowance,
  DEFAULT_ATTENDANCE_STATUS,
  ShiftData,
} from '../types/attendance';
import axios from 'axios';

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
  employeeId: string | undefined,
  lineUserId: string | null | undefined,
  initialAttendanceStatus: AttendanceStatusInfo | null,
): AttendanceHookReturn => {
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo>(
      initialAttendanceStatus || DEFAULT_ATTENDANCE_STATUS,
    );
  const [effectiveShift, setEffectiveShift] = useState(null);

  const [address, setAddress] = useState<string>('');
  const [inPremises, setInPremises] = useState(false);
  const [isOutsideShift] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
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
            timeout: 20000,
            maximumAge: 0,
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
        'Unable to get precise location. Using default location.',
      );
      // Use a default location (e.g., company headquarters)
      const defaultLocation = { lat: 13.50821, lng: 100.76405 };
      setLocation(defaultLocation);
      setAddress('Default location');
      setInPremises(true);
      return defaultLocation;
    }
  }, [isWithinPremises]);

  const getAttendanceStatus = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!employeeId) return;

      try {
        setIsLoading(true);
        const currentLocation = await getCurrentLocation();
        const response = await axios.get('/api/attendance-status', {
          params: {
            employeeId,
            forceRefresh,
            lat: currentLocation?.lat,
            lng: currentLocation?.lng,
          },
        });

        setAttendanceStatus(
          processAttendanceStatus(response.data.attendanceStatus),
        );
        setEffectiveShift(response.data.effectiveShift);
        setCheckInOutAllowance(response.data.checkInOutAllowance);
        setAddress(response.data.address);
      } catch (error) {
        console.error('Error fetching attendance status:', error);
        setError('Failed to fetch attendance status');
      } finally {
        setIsLoading(false);
      }
    },
    [employeeId, getCurrentLocation, processAttendanceStatus],
  );

  useEffect(() => {
    if (employeeId) {
      getAttendanceStatus();
    }
  }, [employeeId, getCurrentLocation, getAttendanceStatus]);

  useEffect(() => {
    if (employeeId) {
      getAttendanceStatus();
    }
  }, [employeeId, getAttendanceStatus]);

  const checkInOut = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      if (!checkInOutAllowance?.allowed) {
        throw new Error('ไม่สามารถลงเวลาได้เพราะไม่เข้าเงื่อนไขของดารลงเวลา');
      }

      const response = await axios.post('/api/check-in-out', {
        employeeId,
        lineUserId,
        isCheckIn: attendanceStatus?.isCheckingIn,
        lat: location?.lat,
        lng: location?.lng,
      });
      console.log('Check-in/out response:', response.data);

      setAttendanceStatus((prevStatus) => ({
        ...prevStatus!,
        isCheckingIn: !prevStatus!.isCheckingIn,
        latestAttendance: response.data.latestAttendance,
      }));

      // Refresh the check-in/out allowance after successful check-in/out
      await getAttendanceStatus(true);
    } catch (error) {
      console.error('Error during check-in/out:', error);
      // Handle error (e.g., show an error message to the user)
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  }, [
    employeeId,
    lineUserId,
    checkInOutAllowance,
    attendanceStatus,
    getAttendanceStatus,
    location?.lat,
    location?.lng,
  ]);

  useEffect(() => {
    if (employeeId && (!initialAttendanceStatus || !effectiveShift)) {
      getAttendanceStatus().catch((error) => {
        console.error('Error fetching initial data:', error);
        setError('An unexpected error occurred');
      });
    }
  }, [
    employeeId,
    initialAttendanceStatus,
    effectiveShift,
    getAttendanceStatus,
  ]);

  return {
    attendanceStatus,
    isLoading,
    error,
    location,
    locationError,
    getCurrentLocation,
    effectiveShift,
    address,
    inPremises,
    isOutsideShift,
    checkInOut,
    checkInOutAllowance,
    refreshAttendanceStatus: getAttendanceStatus,
    isSubmitting: isSubmittingRef.current,
  };
};
