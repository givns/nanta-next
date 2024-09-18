// hooks/useAttendance.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { AttendanceData, AttendanceStatusInfo } from '../types/attendance';
import { UserData } from '../types/user';
import { parseISO, isValid } from 'date-fns';
import { formatTime, formatDate, getBangkokTime } from '../utils/dateUtils';

export const useAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
  initialCheckInOutAllowance: {
    allowed: boolean;
    reason?: string;
    isLate?: boolean;
    isOvertime?: boolean;
  },
) => {
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo>(initialAttendanceStatus);
  const [effectiveShift, setEffectiveShift] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [inPremises, setInPremises] = useState(false);
  const [isOutsideShift, setIsOutsideShift] = useState(false);
  const [checkInOutAllowance, setCheckInOutAllowance] = useState<{
    allowed: boolean;
    reason?: string;
    isLate?: boolean;
    isOvertime?: boolean;
  } | null>(initialCheckInOutAllowance);

  const processAttendanceStatus = useCallback(
    (status: AttendanceStatusInfo) => {
      if (status.latestAttendance?.checkInTime) {
        const checkInTime = parseISO(status.latestAttendance.checkInTime);
        if (!isValid(checkInTime)) {
          console.error(
            'Invalid checkInTime:',
            status.latestAttendance.checkInTime,
          );
          // Set to a default value or handle the error as appropriate
          status.latestAttendance.checkInTime = null;
        } else {
          // Format the time using our utility function
          status.latestAttendance.checkInTime = formatTime(checkInTime);
        }
      }
      // Do the same for checkOutTime if it exists
      if (status.latestAttendance?.checkOutTime) {
        const checkOutTime = parseISO(status.latestAttendance.checkOutTime);
        if (!isValid(checkOutTime)) {
          console.error(
            'Invalid checkOutTime:',
            status.latestAttendance.checkOutTime,
          );
          status.latestAttendance.checkOutTime = null;
        } else {
          status.latestAttendance.checkOutTime = formatTime(checkOutTime);
        }
      }
      return status;
    },
    [],
  );

  useEffect(() => {
    setAttendanceStatus(processAttendanceStatus(initialAttendanceStatus));
  }, [initialAttendanceStatus, processAttendanceStatus]);

  const getAttendanceStatus = useCallback(async () => {
    try {
      const response = await axios.get(
        `/api/user-check-in-status?lineUserId=${userData.lineUserId}`,
      );
      const { attendanceStatus, effectiveShift, checkInOutAllowance } =
        response.data;
      setAttendanceStatus(attendanceStatus);
      setEffectiveShift(effectiveShift);
      setCheckInOutAllowance(checkInOutAllowance);
      return response.data;
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      setError('Failed to fetch attendance status');
      throw error;
    }
  }, [userData.lineUserId]);

  useEffect(() => {
    console.log('useAttendance hook: Initial data', {
      userData,
      initialAttendanceStatus,
    });
  }, [userData, initialAttendanceStatus]);

  const isCheckInOutAllowed = useCallback(async () => {
    if (checkInOutAllowance) {
      return checkInOutAllowance;
    }

    try {
      const data = await getAttendanceStatus();
      return data.checkInOutAllowance;
    } catch (error) {
      console.error('Error checking if check-in/out is allowed:', error);
      setError('Failed to check if check-in/out is allowed');
      return { allowed: false, reason: 'Error checking permissions' };
    }
  }, [checkInOutAllowance, getAttendanceStatus]);

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

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        await getAttendanceStatus();
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();
  }, [getAttendanceStatus]);

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
    refreshAttendanceStatus: getAttendanceStatus,
  };
};
