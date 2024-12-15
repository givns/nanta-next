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
  EnhancedAttendanceStatus,
  AttendanceBaseResponse,
  ValidationResponseWithMetadata,
  ShiftWindowResponse,
  LatestAttendance,
  AttendanceState,
  CheckStatus,
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
      ? ['/api/attendance/status/[employeeId]', employeeId, locationState]
      : null,
    async ([_, id]): Promise<AttendanceStateResponse> => {
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

        // Force immediate refresh if transition detected
        if (
          response.data?.window?.type === 'overtime' &&
          response.data?.base?.latestAttendance?.CheckOutTime
        ) {
          await mutate(response.data, false); // Skip revalidation
        }

        const responseData = response.data;
        console.log('useAttendanceData API response:', responseData);

        // Map the base status response
        const baseResponse: AttendanceBaseResponse = {
          state: responseData.status.state || AttendanceState.ABSENT,
          checkStatus: responseData.status.checkStatus || CheckStatus.PENDING,
          isCheckingIn: responseData.status.isCheckingIn ?? true,
          latestAttendance: responseData.status.latestAttendance
            ? {
                id: responseData.status.id,
                employeeId: responseData.status.employeeId,
                date: responseData.status.latestAttendance.date,
                CheckInTime: responseData.status.latestAttendance.CheckInTime,
                CheckOutTime: responseData.status.latestAttendance.CheckOutTime,
                state: responseData.status.latestAttendance.state,
                checkStatus: responseData.status.latestAttendance.checkStatus,
                overtimeState:
                  responseData.status.latestAttendance.overtimeState,
                isLateCheckIn:
                  responseData.status.latestAttendance.isLateCheckIn,
                isOvertime: responseData.status.latestAttendance.isOvertime,
                isManualEntry:
                  responseData.status.latestAttendance.isManualEntry || false,
                isDayOff:
                  responseData.status.latestAttendance.isDayOff || false,
                shiftStartTime:
                  responseData.status.latestAttendance.shiftStartTime,
                shiftEndTime: responseData.status.latestAttendance.shiftEndTime,
              }
            : undefined,
        };

        // Map validation with metadata
        const mappedValidation: ValidationResponseWithMetadata | undefined =
          responseData.validation
            ? {
                allowed: responseData.validation.allowed,
                reason: responseData.validation.reason,
                flags: {
                  isCheckingIn:
                    responseData.validation.flags?.isCheckingIn || false,
                  isLateCheckIn:
                    responseData.validation.flags?.isLateCheckIn || false,
                  isEarlyCheckOut:
                    responseData.validation.flags?.isEarlyCheckOut || false,
                  isPlannedHalfDayLeave:
                    responseData.validation.flags?.isPlannedHalfDayLeave ||
                    false,
                  isEmergencyLeave:
                    responseData.validation.flags?.isEmergencyLeave || false,
                  isOvertime:
                    responseData.validation.flags?.isOvertime || false,
                  requireConfirmation:
                    responseData.validation.flags?.requireConfirmation || false,
                  isDayOffOvertime:
                    responseData.validation.flags?.isDayOffOvertime || false,
                  isInsideShift:
                    responseData.validation.flags?.isInsideShift || false,
                  isAutoCheckIn:
                    responseData.validation.flags?.isAutoCheckIn || false,
                  isAutoCheckOut:
                    responseData.validation.flags?.isAutoCheckOut || false,
                },
                metadata: responseData.validation.metadata,
              }
            : undefined;

        return {
          base: {
            state: baseResponse.state,
            checkStatus: baseResponse.checkStatus,
            isCheckingIn: baseResponse.isCheckingIn,
            latestAttendance: baseResponse.latestAttendance
              ? {
                  id: responseData.status.latestAttendance.id || '',
                  employeeId: responseData.employeeId,
                  date: baseResponse.latestAttendance.date,
                  CheckInTime: baseResponse.latestAttendance.CheckInTime,
                  CheckOutTime: baseResponse.latestAttendance.CheckOutTime,
                  state: baseResponse.latestAttendance.state,
                  checkStatus: baseResponse.latestAttendance.checkStatus,
                  overtimeState: baseResponse.latestAttendance.overtimeState,
                  isManualEntry: baseResponse.latestAttendance.isManualEntry,
                  isDayOff: baseResponse.latestAttendance.isDayOff,
                  shiftStartTime: baseResponse.latestAttendance.shiftStartTime,
                  shiftEndTime: baseResponse.latestAttendance.shiftEndTime,
                }
              : null,
          },
          window: responseData.window,
          validation: mappedValidation,
          enhanced: responseData.enhanced,
          timestamp: responseData.timestamp,
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
            latestAttendance: data.base?.latestAttendance ?? null,
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
