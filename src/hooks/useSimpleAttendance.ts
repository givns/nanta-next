import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
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

export const useSimpleAttendance = ({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn => {
  const locationService = useRef(new EnhancedLocationService());
  const [locationState, setLocationState] = useState<LocationState>({
    inPremises: false,
    address: '',
    confidence: 'low',
  });
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const getCurrentLocation = useCallback(async (forceRefresh = false) => {
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

      return;
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
  }, []);

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

      return {
        attendanceStatus: response.data.attendanceStatus,
        state: response.data.attendanceStatus?.state || AttendanceState.ABSENT,
        checkStatus:
          response.data.attendanceStatus?.checkStatus || CheckStatus.PENDING,
        overtimeState: response.data.attendanceStatus?.overtimeState,
        effectiveShift: response.data.effectiveShift,
        currentPeriod: response.data.attendanceStatus?.currentPeriod || null,
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
            currentPeriod: null,
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
          const serverTimeResponse = await axios.get('/api/server-time');
          const { serverTime } = serverTimeResponse.data;

          // Force refresh location
          await getCurrentLocation(true);

          // Check location state after refresh
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
            confidence: locationState.confidence, // Include confidence
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
      try {
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
      }
    },
    [mutate, getCurrentLocation, locationState],
  ) as UseSimpleAttendanceActions['refreshAttendanceStatus'];

  Object.assign(refreshAttendanceStatus, { mutate });

  useEffect(() => {
    getCurrentLocation();

    const locationInterval = setInterval(() => {
      getCurrentLocation();
    }, 60000);

    return () => {
      clearInterval(locationInterval);
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
    refreshAttendanceStatus,
    checkInOut,
    getCurrentLocation,
  };
};
