// hooks/useAttendanceData.ts
import { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
  AttendanceState,
  AttendanceStateResponse,
  CheckStatus,
  LocationState,
  ProcessingResult,
  CheckInOutData,
  AppError,
  ErrorCode,
  OvertimeState,
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
  const submitTimeoutRef = useRef<NodeJS.Timeout>();

  const { data, error, mutate } = useSWR<AttendanceStateResponse>(
    enabled && employeeId && locationState.status === 'ready'
      ? ['/api/attendance/status', employeeId, locationState]
      : null,
    async ([url, id]) => {
      try {
        const response = await axios.get(`${url}/${id}`, {
          params: {
            inPremises: locationState.inPremises,
            address: locationState.address,
            confidence: locationState.confidence,
            coordinates: locationState.coordinates,
          },
          timeout: REQUEST_TIMEOUT,
        });

        const responseData = response.data;
        console.log('Raw API Response:', responseData); // Add this log

        return {
          base: {
            state: responseData.status?.state ?? AttendanceState.ABSENT,
            checkStatus:
              responseData.status?.checkStatus ?? CheckStatus.PENDING,
            isCheckingIn: responseData.status?.isCheckingIn ?? true,
            latestAttendance: responseData.base?.latestAttendance ?? {
              regularCheckInTime:
                responseData.status?.latestAttendance?.regularCheckInTime ??
                null,
              regularCheckOutTime:
                responseData.status?.latestAttendance?.regularCheckOutTime ??
                null,
              OvertimeState,
              isManualEntry:
                responseData.status?.latestAttendance?.isManualEntry ?? false,
              isDayOff: false,
            },
          },
          window: responseData.window && {
            ...responseData.window,
            overtimeInfo: responseData.window.overtimeInfo
              ? {
                  ...responseData.window.overtimeInfo,
                  state: determineOvertimeState(
                    responseData.window.overtimeInfo,
                    responseData.status, // Fix this too
                  ),
                }
              : null,
            current: responseData.window.current,
          },
          validation: responseData.validation ?? null,
          timestamp: responseData.timestamp ?? new Date().toISOString(),
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
      let retryCount = 0;

      while (retryCount <= MAX_RETRIES) {
        try {
          console.log('Attempting check-in/out:', {
            attempt: retryCount + 1,
            isCheckIn: params.isCheckIn,
            isOvertime: params.isOvertime,
          });

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
          console.error('Check-in/out error:', error);

          if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
            if (retryCount >= MAX_RETRIES) {
              throw new AppError({
                code: ErrorCode.TIMEOUT,
                message: 'Operation timed out after retries',
              });
            }
          } else if (error instanceof AppError) {
            throw error;
          }

          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * Math.pow(2, retryCount)),
            );
            continue;
          }

          throw new AppError({
            code: ErrorCode.PROCESSING_ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
            originalError: error,
          });
        }
      }

      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: 'Max retries exceeded',
      });
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
    data: data
      ? {
          ...data,
          base: {
            ...data.base,
            latestAttendance: data.base?.latestAttendance ?? {
              CheckInTime: null,
              CheckOutTime: null,
              overtimeState: undefined,
              isManualEntry: false,
              isDayOff: false,
            },
          },
        }
      : undefined,
    error,
    isLoading: !data && !error,
    isRefreshing,
    refreshAttendanceStatus,
    checkInOut,
    mutate,
  };
}

// Helper functions
function determineOvertimeState(
  overtimeInfo: any,
  baseData: any,
): OvertimeState {
  if (!baseData?.latestAttendance?.regularCheckInTime) {
    return OvertimeState.NOT_STARTED;
  }
  if (baseData?.latestAttendance?.regularCheckOutTime) {
    return OvertimeState.COMPLETED;
  }
  return OvertimeState.IN_PROGRESS;
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
