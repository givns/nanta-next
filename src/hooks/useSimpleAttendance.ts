// useSimpleAttendance.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import axios, { AxiosError } from 'axios';
import { EnhancedLocationService } from '../services/EnhancedLocationService';
import {
  UseSimpleAttendanceProps,
  UseSimpleAttendanceState,
  UseSimpleAttendanceActions,
  UseSimpleAttendanceReturn,
  ProcessingResult,
  CheckInOutData,
  AttendanceState,
  CheckStatus,
  PeriodType,
  LocationState,
} from '@/types/attendance';

type FetcherArgs = [url: string, employeeId: string, location: LocationState];
type TimeoutType = ReturnType<typeof setTimeout>;

const LOCATION_CACHE_TIME = 30000; // 30 seconds
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;

export const useSimpleAttendance = ({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn => {
  // Services and Refs
  const locationService = useRef(new EnhancedLocationService());
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();
  const submitTimeoutRef = useRef<NodeJS.Timeout>();

  // Location State
  const locationRef = useRef<{
    promise: Promise<any> | null;
    timestamp: number;
    data: LocationState | null;
  }>({
    promise: null,
    timestamp: 0,
    data: null,
  });

  // State
  const [locationState, setLocationState] = useState<LocationState>({
    inPremises: false,
    address: '',
    confidence: 'low',
  });
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get current location with caching
  const getCurrentLocation = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Return cached location if within cache time and not forcing refresh
    if (
      !forceRefresh &&
      locationRef.current.data &&
      now - locationRef.current.timestamp < LOCATION_CACHE_TIME
    ) {
      return locationRef.current.data;
    }

    // If there's an ongoing request, return it
    if (locationRef.current.promise) {
      return locationRef.current.promise;
    }

    try {
      const locationPromise = locationService.current.getCurrentLocation();
      locationRef.current.promise = locationPromise;

      const result = await locationPromise;
      const locationState = {
        inPremises: result.inPremises,
        address: result.address,
        confidence: result.confidence,
        coordinates: result.coordinates,
        accuracy: result.accuracy,
      };

      setLocationState(locationState);
      locationRef.current.data = locationState;
      locationRef.current.timestamp = now;

      return locationState;
    } finally {
      locationRef.current.promise = null;
    }
  }, []);

  const { data, error, mutate } = useSWR<
    UseSimpleAttendanceState,
    Error,
    FetcherArgs | null
  >(
    employeeId ? ['/api/attendance-status', employeeId, locationState] : null,
    async ([url, id, location]) => {
      try {
        const response = await axios.get(url, {
          params: {
            employeeId: id,
            lineUserId,
            inPremises: location.inPremises,
            address: location.address,
            confidence: location.confidence,
            coordinates: location.coordinates,
            accuracy: location.accuracy,
          },
          timeout: REQUEST_TIMEOUT,
        });

        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 503) {
          // Location validation failed, refresh location
          await getCurrentLocation(true);
        }
        throw error;
      }
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      fallbackData: initialAttendanceStatus
        ? {
            attendanceStatus: initialAttendanceStatus,
            state: initialAttendanceStatus.state,
            checkStatus: initialAttendanceStatus.checkStatus,
            overtimeState: initialAttendanceStatus.overtimeState,
            effectiveShift: null,
            currentPeriod: initialAttendanceStatus.currentPeriod
              ? {
                  ...initialAttendanceStatus.currentPeriod,
                  current: {
                    start: new Date(
                      initialAttendanceStatus.currentPeriod.current.start,
                    ),
                    end: new Date(
                      initialAttendanceStatus.currentPeriod.current.end,
                    ),
                  },
                }
              : null,
            inPremises: false,
            address: '',
            isLoading: true,
            isLocationLoading: true,
            error: null,
            checkInOutAllowance: null,
          }
        : undefined,
    },
  );

  // Check in/out function
  const checkInOut = useCallback(
    async (data: CheckInOutData): Promise<ProcessingResult> => {
      let retryCount = 0;

      while (retryCount <= MAX_RETRIES) {
        try {
          if (submitTimeoutRef.current) {
            clearTimeout(submitTimeoutRef.current);
          }

          // Get latest location
          await getCurrentLocation(true);

          const requestData: CheckInOutData = {
            ...data,
            address: locationState.address,
            entryType: data.isOvertime
              ? PeriodType.OVERTIME
              : PeriodType.REGULAR,
            confidence: locationState.confidence,
          };

          const response = await axios.post<ProcessingResult>(
            '/api/check-in-out',
            requestData,
            {
              timeout: REQUEST_TIMEOUT,
            },
          );

          if (!response.data.success) {
            throw new Error(
              response.data.errors || 'Failed to process attendance',
            );
          }

          await mutate();
          return response.data;
        } catch (error) {
          console.error(
            `Check-in/out error (attempt ${retryCount + 1}):`,
            error,
          );

          const shouldRetry =
            retryCount < MAX_RETRIES &&
            ((error instanceof AxiosError &&
              (error.response?.status === 504 ||
                error.response?.status === 503)) ||
              (error instanceof Error && error.message.includes('timeout')));

          if (shouldRetry) {
            retryCount++;
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * Math.pow(2, retryCount)),
            );
            continue;
          }
          throw error;
        }
      }
      throw new Error('Max retries exceeded');
    },
    [getCurrentLocation, locationState, mutate],
  );

  // Refresh attendance status
  const refreshAttendanceStatus = useCallback(
    async (options?: { forceRefresh?: boolean; throwOnError?: boolean }) => {
      if (isRefreshing) return;

      try {
        setIsRefreshing(true);

        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }

        if (options?.forceRefresh) {
          await getCurrentLocation(true);
        }

        await mutate(undefined, {
          revalidate: true,
          throwOnError: options?.throwOnError,
        });
      } finally {
        setIsRefreshing(false);
      }
    },
    [getCurrentLocation, isRefreshing, mutate],
  ) as UseSimpleAttendanceActions['refreshAttendanceStatus'];

  // Initial location fetch
  useEffect(() => {
    getCurrentLocation();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [getCurrentLocation]);

  return {
    ...(data || {
      attendanceStatus: initialAttendanceStatus,
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      effectiveShift: null,
      currentPeriod: null,
      inPremises: locationState.inPremises,
      address: locationState.address,
      isLoading: true,
      isLocationLoading,
      error: error?.message || locationError,
      checkInOutAllowance: null,
    }),
    refreshAttendanceStatus: Object.assign(refreshAttendanceStatus, { mutate }),
    checkInOut,
    getCurrentLocation,
  };
};
