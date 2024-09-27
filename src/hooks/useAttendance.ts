// hooks/useAttendance.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  AttendanceData,
  AttendanceStatusInfo,
  CheckInOutAllowance,
} from '../types/attendance';
import { UserData } from '../types/user';
import { formatDateTime, getCurrentTime } from '../utils/dateUtils';
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

  const getCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser.');
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
      return newLocation;
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  const debouncedIsCheckInOutAllowed = useCallback(
    debounce(async (): Promise<CheckInOutAllowance> => {
      const currentLocation = location || (await getCurrentLocation());
      if (!currentLocation) {
        return { allowed: false, reason: 'Location not available' };
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
        return response.data;
      } catch (error) {
        console.error('Error checking if check-in/out is allowed:', error);
        return { allowed: false, reason: 'Error checking permissions' };
      }
    }, 300),
    [userData.employeeId, location, getCurrentLocation],
  );

  const refreshAttendanceStatus = useCallback(async () => {
    try {
      const currentLocation = location || (await getCurrentLocation());
      const response = await axios.get('/api/user-check-in-status', {
        params: {
          lineUserId: userData.lineUserId,
          forceRefresh: true,
          lat: currentLocation?.lat,
          lng: currentLocation?.lng,
        },
      });
      setAttendanceStatus(response.data.attendanceStatus);
      setCheckInOutAllowance(response.data.checkInOutAllowance);
    } catch (error) {
      console.error('Error refreshing attendance status:', error);
    }
  }, [userData.lineUserId, location, getCurrentLocation]);

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
          isSubmittingRef.current = false;
          setIsLoading(false);
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
            isSubmittingRef.current = false;
            setIsLoading(false);
            throw err;
          }
        }
      }
      setError('Max retries reached. Please try again later.');
      isSubmittingRef.current = false;
      setIsLoading(false);
      throw new Error('Max retries reached');
    }, 1000),
    [refreshAttendanceStatus],
  );

  return {
    attendanceStatus,
    isLoading,
    error,
    location,
    locationError,
    getCurrentLocation,
    address,
    inPremises,
    isOutsideShift,
    checkInOut,
    debouncedIsCheckInOutAllowed,
    refreshAttendanceStatus: getAttendanceStatus,
    checkInOutAllowance,
    isSubmitting: isSubmittingRef.current,
  };
};
