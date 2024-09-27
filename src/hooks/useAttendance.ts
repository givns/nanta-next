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
import { debounce, get } from 'lodash';

export const useAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
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
    useState<CheckInOutAllowance | null>(null);

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
    const currentLocation = await getCurrentLocation();
    if (!currentLocation) {
      setCheckInOutAllowance({
        allowed: false,
        reason: 'Location not available',
      });
      return;
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
    } catch (error) {
      console.error('Error checking if check-in/out is allowed:', error);
      setCheckInOutAllowance({
        allowed: false,
        reason: 'Error checking permissions',
      });
    }
  }, [userData.employeeId, getCurrentLocation]);

  const debouncedFetchCheckInOutAllowance = useRef(
    debounce(fetchCheckInOutAllowance, 300),
  ).current;

  useEffect(() => {
    fetchCheckInOutAllowance(); // Initial fetch without debounce
    return () => {
      debouncedFetchCheckInOutAllowance.cancel(); // Clean up debounced function
    };
  }, [fetchCheckInOutAllowance, debouncedFetchCheckInOutAllowance]);

  const refreshCheckInOutAllowance = useCallback(
    (immediate: boolean = false) => {
      if (immediate) {
        fetchCheckInOutAllowance();
      } else {
        debouncedFetchCheckInOutAllowance();
      }
    },
    [fetchCheckInOutAllowance, debouncedFetchCheckInOutAllowance],
  );

  const getAttendanceStatus = useCallback(
    async (forceRefresh: boolean = false) => {
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
    [userData.lineUserId, processAttendanceStatus, getCurrentLocation],
  );

  const refreshAttendanceStatus = useCallback(async () => {
    return getAttendanceStatus(true);
  }, [getAttendanceStatus]);

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
    checkInOutAllowance,
    refreshCheckInOutAllowance,
    refreshAttendanceStatus: getAttendanceStatus,
    isSubmitting: isSubmittingRef.current,
  };
};
