// hooks/useAttendance.ts
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import {
  AttendanceData,
  AttendanceStatusInfo,
  CheckInOutAllowance,
  AttendanceHookReturn,
  ShiftData,
} from '../types/attendance';
import { UserData } from '../types/user';
import { formatDateTime, getCurrentTime } from '../utils/dateUtils';
import { debounce, DebouncedFunc } from 'lodash';
import { AppErrors } from '../utils/errorHandler';

export const useAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
): AttendanceHookReturn => {
  console.log('useAttendance hook initialized');

  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo>(initialAttendanceStatus);
  const [effectiveShiftState, setEffectiveShiftState] =
    useState<ShiftData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [address] = useState<string>('');
  const [inPremises] = useState(false);
  const [isOutsideShift] = useState(false);
  const [checkInOutAllowance, setCheckInOutAllowance] =
    useState<CheckInOutAllowance | null>(null);

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

      console.log('Current location:', newLocation); // Add this log

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
        inPremises,
        address,
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
        inPremises,
        address,
      });
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
        setEffectiveShiftState(effectiveShift);
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

  const checkInOut = useCallback(
    (attendanceData: AttendanceData): Promise<any> => {
      return new Promise((resolve, reject) => {
        const debouncedFunction: DebouncedFunc<
          (data: AttendanceData) => Promise<any>
        > = debounce(async (data: AttendanceData) => {
          if (isSubmittingRef.current) {
            console.log('Submission already in progress');
            reject(new Error('Submission already in progress'));
            return;
          }

          isSubmittingRef.current = true;
          setIsLoading(true);
          setError(null);

          console.log(
            `Initiating check-in/out at: ${formatDateTime(getCurrentTime(), 'yyyy-MM-dd HH:mm:ss')}`,
          );
          console.log('Sending check-in/out data:', data);

          const backoff = (attempt: number) => Math.pow(2, attempt) * 1000;
          let attempt = 0;

          while (attempt < 3) {
            try {
              const response = await axios.post('/api/check-in-out', data);
              console.log('Check-in/out response:', response.data);

              setAttendanceStatus((prevStatus) => ({
                ...prevStatus,
                isCheckingIn: !prevStatus.isCheckingIn,
                latestAttendance: response.data.latestAttendance,
              }));

              await refreshAttendanceStatus();
              isSubmittingRef.current = false;
              setIsLoading(false);
              resolve(response.data);
              return;
            } catch (err) {
              console.error('Error during check-in/out:', err);
              if (axios.isAxiosError(err) && err.response?.status === 429) {
                console.log(
                  `Rate limit reached. Retry attempt ${attempt + 1} of 3...`,
                );
                attempt++;
                await new Promise((resolveTimeout) =>
                  setTimeout(resolveTimeout, backoff(attempt)),
                );
              } else {
                setError(
                  'An error occurred during check-in/out. Please try again.',
                );
                isSubmittingRef.current = false;
                setIsLoading(false);
                reject(err);
                return;
              }
            }
          }
          setError('Max retries reached. Please try again later.');
          isSubmittingRef.current = false;
          setIsLoading(false);
          reject(new Error('Max retries reached'));
        }, 1000);

        debouncedFunction(attendanceData);
      });
    },
    [refreshAttendanceStatus],
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

  return useMemo<AttendanceHookReturn>(
    () => ({
      attendanceStatus,
      isLoading,
      error,
      location,
      locationError,
      getCurrentLocation,
      effectiveShift: effectiveShiftState,
      address,
      inPremises,
      isOutsideShift,
      checkInOut,
      checkInOutAllowance,
      fetchCheckInOutAllowance,
      refreshAttendanceStatus: getAttendanceStatus,
      isSubmitting: isSubmittingRef.current,
    }),
    [
      attendanceStatus,
      isLoading,
      error,
      location,
      locationError,
      getCurrentLocation,
      effectiveShiftState,
      address,
      inPremises,
      isOutsideShift,
      checkInOut,
      checkInOutAllowance,
      fetchCheckInOutAllowance,
      getAttendanceStatus,
    ],
  );
};
