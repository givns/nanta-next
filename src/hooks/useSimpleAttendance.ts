// useSimpleAttendance.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { KeyedMutator } from 'swr';
import axios from 'axios';
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
type IntervalType = ReturnType<typeof setInterval>;
type TimeoutType = ReturnType<typeof setTimeout>;

export const useSimpleAttendance = ({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn => {
  const locationService = useRef(new EnhancedLocationService());
  const locationIntervalRef = useRef<IntervalType>();
  const refreshTimeoutRef = useRef<TimeoutType>();

  const [locationState, setLocationState] = useState<LocationState>({
    inPremises: false,
    address: '',
    confidence: 'low',
  });
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getCurrentLocation = useCallback(
    async (forceRefresh = false) => {
      if (isLocationLoading && !forceRefresh) return;
      setIsLocationLoading(true);
      setLocationError(null);

      try {
        const result =
          await locationService.current.getCurrentLocation(forceRefresh);
        setLocationState({
          inPremises: result.inPremises,
          address: result.address,
          confidence: result.confidence,
          coordinates: result.coordinates,
          accuracy: result.accuracy,
        });
      } catch (error) {
        console.error('Location error:', error);
        setLocationError(
          error instanceof Error ? error.message : 'Failed to get location',
        );
        setLocationState({
          inPremises: false,
          address: 'Unknown location',
          confidence: 'low',
        });
      } finally {
        setIsLocationLoading(false);
      }
    },
    [isLocationLoading],
  );

  const { data, error, mutate } = useSWR<
    UseSimpleAttendanceState,
    Error,
    FetcherArgs | null
  >(
    employeeId ? ['/api/attendance-status', employeeId, locationState] : null,
    async ([url, id, location]) => {
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
      });

      // Ensure dates are properly parsed
      const attendanceData = response.data.attendanceStatus;
      const currentPeriod = attendanceData?.currentPeriod;

      return {
        attendanceStatus: response.data.attendanceStatus,
        state: attendanceData?.state || AttendanceState.ABSENT,
        checkStatus: attendanceData?.checkStatus || CheckStatus.PENDING,
        overtimeState: attendanceData?.overtimeState,
        effectiveShift: response.data.effectiveShift,
        currentPeriod: currentPeriod
          ? {
              ...currentPeriod,
              current: {
                start: currentPeriod.current?.start
                  ? new Date(currentPeriod.current.start)
                  : new Date(),
                end: currentPeriod.current?.end
                  ? new Date(currentPeriod.current.end)
                  : new Date(),
              },
            }
          : null,
        inPremises: location.inPremises,
        address: location.address,
        isLoading: false,
        isLocationLoading,
        error: null,
        checkInOutAllowance: response.data.checkInOutAllowance,
      };
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 5000,
      onError: async (err) => {
        if (
          axios.isAxiosError(err) &&
          (err.response?.data?.code === 'OUTSIDE_PREMISES' ||
            err.response?.status === 503)
        ) {
          await getCurrentLocation(true);
        }
      },
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

  const checkInOut = useCallback(
    async (data: CheckInOutData): Promise<ProcessingResult> => {
      let retryCount = 0;
      const MAX_RETRIES = 2;

      while (retryCount <= MAX_RETRIES) {
        try {
          // Cancel any pending refresh
          if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
          }

          const serverTimeResponse = await axios.get('/api/server-time');
          const { serverTime } = serverTimeResponse.data;

          await getCurrentLocation(true);

          if (!locationState.inPremises && locationState.confidence === 'low') {
            throw new Error('Failed to validate location');
          }

          const requestData: CheckInOutData = {
            ...data,
            checkTime: serverTime,
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
              timeout: 30000,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );

          if (!response.data.success || response.data.errors) {
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
            axios.isAxiosError(error) &&
            (error.response?.status === 504 || error.response?.status === 503);

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
    [mutate, locationState, getCurrentLocation],
  );

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
          if (
            !locationState.inPremises &&
            locationState.confidence === 'low' &&
            options.throwOnError
          ) {
            throw new Error('Failed to validate location');
          }
        }

        await mutate(undefined, {
          revalidate: true,
          throwOnError: options?.throwOnError,
        });
      } catch (error) {
        console.error('Refresh failed:', error);
        throw error;
      } finally {
        setIsRefreshing(false);
      }
    },
    [mutate, getCurrentLocation, locationState, isRefreshing],
  ) as UseSimpleAttendanceActions['refreshAttendanceStatus'];

  useEffect(() => {
    getCurrentLocation();

    // Clear any existing interval
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    locationIntervalRef.current = setInterval(() => {
      getCurrentLocation();
    }, 60000);

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
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
