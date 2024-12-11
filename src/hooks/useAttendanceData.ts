// hooks/useAttendanceData.ts
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
        console.log('API response:', responseData);

        // Map the latest attendance with proper handling of undefined fields
        const mappedLatestAttendance = responseData.status.latestAttendance
          ? {
              ...responseData.status.latestAttendance,
              CheckInTime: responseData.status.latestAttendance.CheckInTime,
              CheckOutTime: responseData.status.latestAttendance.CheckOutTime,
              overtimeState: responseData.status.latestAttendance.overtimeState,
              isOvertime:
                responseData.status.latestAttendance.isOvertime || false,
              isManualEntry:
                responseData.status.latestAttendance.isManualEntry || false,
              isDayOff: responseData.status.latestAttendance.isDayOff || false,
              shiftStartTime:
                responseData.status.latestAttendance.shiftStartTime,
              shiftEndTime: responseData.status.latestAttendance.shiftEndTime,
              state: responseData.status.latestAttendance.state,
              checkStatus: responseData.status.latestAttendance.checkStatus,
            }
          : null;

        // Map the window response with overtime info
        const mappedWindow = {
          ...responseData.window,
          overtimeInfo: responseData.window.overtimeInfo
            ? {
                ...responseData.window.overtimeInfo,
                durationMinutes:
                  responseData.window.overtimeInfo.durationMinutes || 0,
                isInsideShiftHours:
                  responseData.window.overtimeInfo.isInsideShiftHours || false,
                isDayOffOvertime:
                  responseData.window.overtimeInfo.isDayOffOvertime || false,
              }
            : undefined,
        };

        return {
          base: {
            state: responseData.status.state,
            checkStatus: responseData.status.checkStatus,
            isCheckingIn: responseData.status.isCheckingIn,
            latestAttendance: mappedLatestAttendance,
          },
          window: mappedWindow,
          validation: responseData.validation,
          enhanced: responseData.enhanced,
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

          if (response.data.metadata?.autoCompleted) {
            console.log('Auto-completion successful:', {
              ...response.data,
              autoCompletedEntries:
                response.data.metadata?.autoCompletedEntries,
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
            enhanced: data.enhanced, // Include enhanced status in return
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
  if (!baseData?.latestAttendance?.CheckInTime) {
    return OvertimeState.NOT_STARTED;
  }
  if (baseData?.latestAttendance?.CheckOutTime) {
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
