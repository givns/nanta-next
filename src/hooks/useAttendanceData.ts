import { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
  AttendanceStateResponse,
  LocationState,
  ProcessingResult,
  CheckInOutData,
  AppError,
  ErrorCode,
  AttendanceStatusResponse,
  PeriodType,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';

const REQUEST_TIMEOUT = 40000;
const MAX_RETRIES = 0;

interface UseAttendanceDataProps {
  employeeId?: string;
  lineUserId?: string;
  locationState: LocationState;
  initialAttendanceStatus?: AttendanceStateResponse;
  enabled?: boolean;
}

export function useAttendanceData({
  employeeId,
  lineUserId,
  locationState,
  initialAttendanceStatus,
  enabled = true,
}: UseAttendanceDataProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();

  const { data, error, mutate } = useSWR<AttendanceStatusResponse>(
    enabled && employeeId && locationState.status === 'ready'
      ? ['/api/attendance/status/[employeeId]', employeeId, locationState]
      : null,
    async ([_, id]): Promise<AttendanceStatusResponse> => {
      try {
        const response = await axios.get(`/api/attendance/status/${id}`, {
          params: {
            inPremises: locationState.inPremises,
            address: locationState.address,
            confidence: locationState.confidence,
            coordinates: locationState.coordinates,
          },
          timeout: REQUEST_TIMEOUT,
        });

        // Safely handle transitions
        const transitions = response.data?.daily?.transitions;
        const shouldForceRefresh =
          transitions &&
          transitions.from?.type === PeriodType.OVERTIME &&
          response.data?.base?.latestAttendance?.CheckOutTime;

        if (shouldForceRefresh) {
          await mutate(response.data, false);
        }

        return {
          daily: {
            ...response.data.daily,
            // Ensure transitions is never undefined
            transitions: response.data.daily.transitions || {
              from: null,
              to: null,
              transitionTime: null,
              isComplete: false,
            },
          },
          base: response.data.base,
          window: response.data.window,
          validation: {
            allowed: response.data.validation.allowed,
            reason: response.data.validation.reason,
            flags: {
              ...response.data.validation.flags,
              isPendingDayOffOvertime: false,
              isPendingOvertime: false,
              isOutsideShift: false,
              isLate: false,
              isEarly: false,
              isEarlyCheckIn:
                response.data.validation.periodValidation.currentPeriod
                  .enhancement.isEarlyForPeriod,
              isEarlyCheckOut: false,
              isLateCheckIn: false,
              isLateCheckOut:
                response.data.validation.periodValidation.currentPeriod
                  .enhancement.isLateForPeriod,
              isVeryLateCheckOut: false,
              isAutoCheckIn: false,
              isAutoCheckOut: false,
              isAfternoonShift: false,
              isMorningShift: false,
              isAfterMidshift: false,
              isApprovedEarlyCheckout: false,
              isPlannedHalfDayLeave: false,
              isEmergencyLeave: false,
              hasActivePeriod: false,
              hasPendingTransition:
                response.data.daily.transitions?.isComplete === false,
              requiresAutoCompletion: false,
              isHoliday: false,
              isDayOff: false,
              isManualEntry: false,
            },
            periodValidation: response.data.validation.periodValidation,
          },
          enhanced: response.data.enhanced,
        };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 503) {
          console.error('Service temporarily unavailable:', error);
        }
        throw handleAttendanceError(error);
      }
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 5000,
      fallbackData: initialAttendanceStatus,
      onError: (error) => {
        console.error('SWR Error:', error);
      },
    },
  );

  const checkInOut = useCallback(
    async (params: CheckInOutData) => {
      try {
        const response = await axios.post<ProcessingResult>(
          '/api/attendance/check-in-out',
          {
            ...params,
            employeeId,
            lineUserId,
            address: locationState.address,
            inPremises: locationState.inPremises,
            confidence: locationState.confidence,
            checkTime: getCurrentTime().toISOString(),
          },
          { timeout: REQUEST_TIMEOUT },
        );

        if (!response.data.success) {
          throw new AppError({
            code: ErrorCode.PROCESSING_ERROR,
            message:
              typeof response.data.errors === 'string'
                ? response.data.errors
                : 'Failed to process attendance',
          });
        }

        await mutate(undefined, { revalidate: true });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
          throw new AppError({
            code: ErrorCode.TIMEOUT,
            message: 'Operation timed out',
          });
        }
        throw handleAttendanceError(error);
      }
    },
    [employeeId, lineUserId, locationState, mutate],
  );

  const refreshAttendanceStatus = useCallback(
    async (options?: { forceRefresh?: boolean; throwOnError?: boolean }) => {
      if (isRefreshing) return;

      try {
        setIsRefreshing(true);
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }

        await mutate(undefined, {
          revalidate: true,
          throwOnError: options?.throwOnError,
        });
      } finally {
        setIsRefreshing(false);
      }
    },
    [isRefreshing, mutate],
  );

  return {
    data,
    error,
    isLoading: !data && !error,
    isRefreshing,
    refreshAttendanceStatus,
    checkInOut,
    mutate,
  };
}

function handleAttendanceError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return new AppError({
        code: ErrorCode.TIMEOUT,
        message: 'Request timed out',
        originalError: error,
      });
    }
    return new AppError({
      code: ErrorCode.NETWORK_ERROR,
      message: error.message,
      originalError: error,
    });
  }

  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    originalError: error,
  });
}
