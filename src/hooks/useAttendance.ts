// hooks/useAttendance.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  AttendanceData,
  AttendanceStatusInfo,
  CheckInOutAllowance,
} from '../types/attendance';
import { UserData } from '../types/user';
import { parseISO, isValid } from 'date-fns';
import { formatTime, formatDate } from '../utils/dateUtils';
import { CheckInOut } from '@/lib/types';

export const useAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
  initialCheckInOutAllowance: CheckInOutAllowance,
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
    countdown?: number;
  } | null>(initialCheckInOutAllowance);

  const processAttendanceStatus = useCallback(
    (status: AttendanceStatusInfo) => {
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
    setAttendanceStatus(processAttendanceStatus(initialAttendanceStatus));
  }, [initialAttendanceStatus, processAttendanceStatus]);

  const getAttendanceStatus = useCallback(
    async (forceRefresh: boolean = false) => {
      try {
        setIsLoading(true);
        const response = await axios.get(
          `/api/user-check-in-status?lineUserId=${userData.lineUserId}&forceRefresh=${forceRefresh}`,
        );
        const { attendanceStatus, effectiveShift, checkInOutAllowance } =
          response.data;
        setAttendanceStatus(processAttendanceStatus(attendanceStatus));
        setEffectiveShift(effectiveShift);
        setCheckInOutAllowance(checkInOutAllowance);
        return response.data;
      } catch (error) {
        console.error('Error fetching attendance status:', error);
        setError('Failed to fetch attendance status');
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [userData.lineUserId, processAttendanceStatus],
  );

  const refreshAttendanceStatus = useCallback(async () => {
    return getAttendanceStatus(true);
  }, [getAttendanceStatus]);

  const isCheckInOutAllowed = useCallback(async () => {
    if (!location) {
      return { allowed: false, reason: 'Location not available' };
    }

    try {
      const response = await axios.get('/api/attendance/allowed', {
        params: {
          employeeId: userData.employeeId,
          lat: location.lat,
          lng: location.lng,
        },
      });
      const allowanceData = response.data;
      setCheckInOutAllowance(allowanceData);
      return allowanceData;
    } catch (error) {
      console.error('Error checking if check-in/out is allowed:', error);
      setError('Failed to check if check-in/out is allowed');
      return { allowed: false, reason: 'Error checking permissions' };
    }
  }, [location, userData.employeeId]);

  useEffect(() => {
    if (location) {
      isCheckInOutAllowed();
    }
  }, [location, isCheckInOutAllowed]);

  const checkInOut = useCallback(
    async (attendanceData: AttendanceData) => {
      console.log('AttendanceData received in useAttendance:', attendanceData);
      setIsLoading(true);
      setError(null);

      // Optimistic update
      setAttendanceStatus((prevStatus) => {
        const now = new Date();
        const formattedNow = formatTime(now);
        return {
          ...prevStatus,
          isCheckingIn: !prevStatus.isCheckingIn,
          latestAttendance: prevStatus.latestAttendance
            ? {
                ...prevStatus.latestAttendance,
                [attendanceData.isCheckIn ? 'checkInTime' : 'checkOutTime']:
                  formattedNow,
                status: attendanceData.isCheckIn ? 'checked-in' : 'checked-out',
              }
            : {
                id: 'temp-id', // This will be replaced by the server response
                employeeId: attendanceData.employeeId,
                date: formatDate(now),
                checkInTime: attendanceData.isCheckIn ? formattedNow : null,
                checkOutTime: attendanceData.isCheckIn ? null : formattedNow,
                status: attendanceData.isCheckIn ? 'checked-in' : 'checked-out',
                isManualEntry: false,
              },
        };
      });

      try {
        console.log('Sending check-in/out data:', attendanceData);
        const response = await axios.post('/api/check-in-out', attendanceData);
        console.log('Check-in/out response:', response.data);

        if (response.data.error) {
          console.warn(
            'Check-in/out processed with warnings:',
            response.data.error,
          );
        }

        // Update with server response
        setAttendanceStatus(response.data);

        return response.data;
      } catch (err) {
        console.error('Error during check-in/out:', err);

        // Revert optimistic update on error
        await refreshAttendanceStatus();

        if (axios.isAxiosError(err)) {
          console.error('Error response:', err.response?.data);
        }

        setError(
          'An error occurred during check-in/out. Please check your attendance status.',
        );
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [refreshAttendanceStatus],
  );

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

        setCheckInOutAllowance((prevAllowance) => ({
          ...prevAllowance,
          allowed: response.data.inPremises,
          reason: response.data.inPremises
            ? undefined
            : 'คุณไม่ได้อยู่ที่ทำงาน',
        }));
      } catch (error) {
        console.error('Error getting location:', error);
        setError('Unable to get precise location.');
        setAddress('Unknown');
        setInPremises(false);
        setCheckInOutAllowance((prevAllowance) => ({
          ...prevAllowance,
          allowed: false,
          reason: 'Unable to determine your location',
        }));
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
    checkInOutAllowance,
  };
};
