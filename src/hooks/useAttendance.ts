// hooks/useAttendance.ts
import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { parseISO, format } from 'date-fns';
import { zonedTimeToUtc } from '../utils/dateUtils';
import { AttendanceData, AttendanceStatusInfo } from '../types/attendance';
import { UserData } from '../types/user';

export const useAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
) => {
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo>(initialAttendanceStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [inPremises, setInPremises] = useState(false);
  const [isOutsideShift, setIsOutsideShift] = useState(false);

  const checkInOut = useCallback(async (attendanceData: AttendanceData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/check-in-out', attendanceData);
      setAttendanceStatus((prevStatus) => ({
        ...prevStatus,
        isCheckingIn: !prevStatus.isCheckingIn,
        latestAttendance: response.data,
      }));
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshAttendanceStatus = useCallback(async () => {
    try {
      const response = await axios.get(
        `/api/attendance?employeeId=${userData.employeeId}`,
      );
      setAttendanceStatus(response.data);
    } catch (error) {
      console.error('Error fetching latest attendance status:', error);
      setError('Failed to fetch latest attendance status');
    }
  }, [userData.employeeId]);

  const isCheckInOutAllowed = useCallback(async () => {
    try {
      const response = await axios.get(
        `/api/attendance/allowed?employeeId=${userData.employeeId}`,
      );
      return response.data;
    } catch (error) {
      console.error('Error checking if check-in/out is allowed:', error);
      setError('Failed to check if check-in/out is allowed');
      return { allowed: false, reason: 'Error checking permissions' };
    }
  }, [userData.employeeId]);

  useEffect(() => {
    const getCurrentLocation = async () => {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by this browser.');
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          },
        );

        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLocation(newLocation);

        const response = await axios.post('/api/location/check', newLocation);
        setAddress(response.data.address);
        setInPremises(response.data.inPremises);
      } catch (error) {
        setError('Unable to get precise location.');
      }
    };

    getCurrentLocation();
  }, []);

  useEffect(() => {
    const checkOutsideShift = async () => {
      try {
        const response = await axios.get(
          `/api/shifts/check-outside?employeeId=${userData.employeeId}`,
        );
        setIsOutsideShift(response.data.isOutsideShift);
      } catch (error) {
        console.error('Error checking if outside shift:', error);
      }
    };

    checkOutsideShift();
  }, [userData.employeeId]);

  return {
    attendanceStatus,
    isLoading,
    error,
    location,
    address,
    inPremises,
    isOutsideShift,
    checkInOut,
    isCheckInOutAllowed,
    refreshAttendanceStatus,
  };
};
