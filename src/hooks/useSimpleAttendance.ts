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
} from '@/types/attendance';

type FetcherArgs = [url: string, employeeId: string, location: LocationState];

interface LocationState {
  inPremises: boolean;
  address: string;
}

export const useSimpleAttendance = ({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn => {
  // Initialize LocationService
  const locationService = useRef(new EnhancedLocationService());
  const [locationState, setLocationState] = useState<LocationState>({
    inPremises: false,
    address: '',
  });
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Enhanced getCurrentLocation function
  const getCurrentLocation = useCallback(async (forceRefresh = false) => {
    setIsLocationLoading(true);
    setLocationError(null);

    try {
      const result =
        await locationService.current.getCurrentLocation(forceRefresh);
      setLocationState({
        inPremises: result.inPremises,
        address: result.address,
      });
    } catch (error) {
      console.error('Location error:', error);
      setLocationError(
        error instanceof Error ? error.message : 'Failed to get location',
      );
      setLocationState({
        inPremises: false,
        address: 'Unknown location',
      });
    } finally {
      setIsLocationLoading(false);
    }
  }, []);

  // SWR configuration
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

  // Enhanced checkInOut with retries
  const checkInOut = useCallback(
    async (data: CheckInOutData): Promise<ProcessingResult> => {
      try {
        // Get server time
        const serverTimeResponse = await axios.get('/api/server-time');
        const { serverTime } = serverTimeResponse.data;

        // Force refresh location before check-in/out
        await getCurrentLocation(true);

        const requestData: CheckInOutData = {
          ...data,
          checkTime: serverTime,
          address: locationState.address,
          entryType: data.isOvertime ? PeriodType.OVERTIME : PeriodType.REGULAR,
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
        console.error('Check-in/out error:', error);

        // Handle timeout with retry
        if (axios.isAxiosError(error) && error.response?.status === 504) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return checkInOut(data); // Single retry
        }

        throw error;
      }
    },
    [mutate, locationState, getCurrentLocation],
  );

  const refreshAttendanceStatus = useCallback(
    async (options?: { forceRefresh?: boolean; throwOnError?: boolean }) => {
      try {
        if (options?.forceRefresh) {
          await getCurrentLocation(true);
        }
        await mutate(undefined, {
          revalidate: options?.forceRefresh ?? true,
          throwOnError: options?.throwOnError,
        });
      } catch (error) {
        console.error('Refresh failed:', error);
        throw error;
      }
    },
    [mutate, getCurrentLocation],
  ) as UseSimpleAttendanceActions['refreshAttendanceStatus'];

  // Assign mutate to refreshAttendanceStatus
  Object.assign(refreshAttendanceStatus, { mutate });

  // Initial location fetch and periodic updates
  useEffect(() => {
    getCurrentLocation();

    const locationInterval = setInterval(() => {
      getCurrentLocation();
    }, 60000); // Update location every minute

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
