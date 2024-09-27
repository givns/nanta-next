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
import {
  formatTime,
  formatDate,
  formatDateTime,
  getCurrentTime,
} from '../utils/dateUtils';
import { debounce } from 'lodash';

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
  const [locationError, setLocationError] = useState<string | null>(null);
  const [address, setAddress] = useState<string>('');
  const [inPremises, setInPremises] = useState(false);
  const [isOutsideShift, setIsOutsideShift] = useState(false);
  const [checkInOutAllowance, setCheckInOutAllowance] =
    useState<CheckInOutAllowance | null>(initialCheckInOutAllowance);

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
      const response = await axios.get<CheckInOutAllowance>(
        '/api/attendance/allowed',
        {
          params: {
            employeeId: userData.employeeId,
            lat: location.lat,
            lng: location.lng,
          },
        },
      );
      return response.data;
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

  const isSubmittingRef = useRef(false);

  const checkInOut = useCallback(
    debounce(async (attendanceData: AttendanceData) => {
      if (isSubmittingRef.current) {
        console.log('Submission already in progress');
        return;
      }

      isSubmittingRef.current = true;
      setIsLoading(true);
      setError(null);

      console.log(
        `Initiating check-in/out at: ${formatDateTime(getCurrentTime(), 'yyyy-MM-dd HH:mm:ss')}`,
      );
      console.log('Sending check-in/out data:', attendanceData);

      const backoff = (attempt: number) => Math.pow(2, attempt) * 1000;
      let attempt = 0;

      while (attempt < 3) {
        try {
          console.log('Sending check-in/out data:', attendanceData);
          const response = await axios.post(
            '/api/check-in-out',
            attendanceData,
          );
          console.log('Check-in/out response:', response.data);

          setAttendanceStatus((prevStatus) => ({
            ...prevStatus,
            isCheckingIn: !prevStatus.isCheckingIn,
            latestAttendance: response.data.latestAttendance,
          }));

          await refreshAttendanceStatus();
          return response.data;
        } catch (err) {
          console.error('Error during check-in/out:', err);
          if (axios.isAxiosError(err) && err.response?.status === 429) {
            console.log(
              `Rate limit reached. Retry attempt ${attempt + 1} of 3...`,
            );
            attempt++;
            await new Promise((resolve) =>
              setTimeout(resolve, backoff(attempt)),
            );
          } else {
            setError(
              'An error occurred during check-in/out. Please try again.',
            );
            throw err;
          }
        }
      }
      setError('Max retries reached. Please try again later.');
      throw new Error('Max retries reached');
    }, 1000),
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
        setLocationError('Geolocation is not supported by this browser.');
        return;
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

        const response = await axios.post('/api/location/check', newLocation);
        setAddress(response.data.address);
        setInPremises(response.data.inPremises);

        if (!response.data.inPremises) {
          setCheckInOutAllowance({
            allowed: false,
            reason: 'คุณไม่ได้อยู่ในพื้นที่เข้า-ออกงานได้',
          });
        } else {
          // Only check other conditions if user is in premises
          const allowance = await isCheckInOutAllowed();
          setCheckInOutAllowance(allowance);
        }
      } catch (error) {
        console.error('Error getting location:', error);
        setLocationError(
          'Unable to get precise location. Please enable location services and try again.',
        );
        setLocation(null);
        setCheckInOutAllowance({
          allowed: false,
          reason: 'Unable to determine your location',
        });
      }
    };

    getCurrentLocation();
  }, []);

  return {
    attendanceStatus,
    isLoading,
    error,
    location,
    locationError,
    address,
    inPremises,
    isOutsideShift,
    checkInOut,
    isCheckInOutAllowed,
    refreshAttendanceStatus: getAttendanceStatus,
    checkInOutAllowance,
    isSubmitting: isSubmittingRef.current,
  };
};
