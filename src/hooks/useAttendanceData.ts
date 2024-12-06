import { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
  type LocationState,
  type CheckInOutData,
  type ProcessingResult,
  type AttendanceStateResponse,
  AppError,
  ErrorCode,
} from '@/types/attendance';

const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 2;

const defaultLatestAttendance = {
  regularCheckInTime: null,
  regularCheckOutTime: null,
} as const;

export function useAttendanceData({
  employeeId,
  lineUserId,
  locationState,
  initialAttendanceStatus,
  enabled = true,
}: {
  employeeId?: string;
  lineUserId?: string;
  locationState: LocationState;
  initialAttendanceStatus?: AttendanceStateResponse;
  enabled?: boolean;
}) {
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
        return {
          base: {
            state: responseData.base?.state ?? 'absent',
            checkStatus: responseData.base?.checkStatus ?? 'pending',
            isCheckingIn: responseData.base?.isCheckingIn ?? true,
            latestAttendance:
              responseData.base?.latestAttendance ?? defaultLatestAttendance,
          },
          window: responseData.window,
          validation: responseData.validation || null,
          timestamp: responseData.timestamp || new Date().toISOString(),
        } satisfies AttendanceStateResponse;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 503) {
          console.error('Service temporarily unavailable:', error);
        }
        throw error;
      }
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 5000,
      fallbackData: initialAttendanceStatus
        ? {
            ...initialAttendanceStatus,
            base: {
              ...initialAttendanceStatus.base,
              latestAttendance: {
                ...initialAttendanceStatus.base?.latestAttendance,
                regularCheckInTime:
                  initialAttendanceStatus.base?.latestAttendance
                    ?.regularCheckInTime ?? undefined,
              },
            },
          }
        : undefined,
    },
  );

  const checkInOut = useCallback(
    async (params: CheckInOutData): Promise<ProcessingResult> => {
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
              inPremises: locationState.inPremises, // Add required field
              confidence: locationState.confidence,
              // Let server handle time
              checkTime: '',
            },
            {
              timeout: REQUEST_TIMEOUT,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );

          if (!response.data.success) {
            const errorMessage =
              typeof response.data.errors === 'object' &&
              response.data.errors !== null
                ? response.data.errors
                : 'Failed to process attendance';
            throw new AppError({
              code: ErrorCode.PROCESSING_ERROR,
              message: errorMessage,
            });
          }

          // Mutate cache after successful operation
          await mutate();
          return response.data;
        } catch (error) {
          console.error('Check-in/out error:', error);

          // Handle timeout specially
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

          // Retry with exponential backoff
          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            const delay = 1000 * Math.pow(2, retryCount);
            await new Promise((resolve) => setTimeout(resolve, delay));
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
            latestAttendance:
              data.base?.latestAttendance ?? defaultLatestAttendance,
          },
        }
      : undefined,
    error,
    isLoading: !data,
    refreshAttendanceStatus,
    checkInOut,
    mutate,
  };
}
