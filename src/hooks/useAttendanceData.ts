// hooks/useAttendanceData.ts
import { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
  ProcessingResult,
  CheckInOutData,
  AppError,
  ErrorCode,
  AttendanceStatusResponse,
  UseAttendanceDataProps,
  ShiftContext,
  TransitionContext,
  StateValidation,
  UnifiedPeriodState,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { StatusHelpers } from '@/services/Attendance/utils/StatusHelper';

const REQUEST_TIMEOUT = 40000;
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 5000,
};

// Add retry utility
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries = RETRY_CONFIG.MAX_RETRIES,
  delay = RETRY_CONFIG.INITIAL_DELAY,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;

    // Calculate next delay with exponential backoff
    const nextDelay = Math.min(delay * 2, RETRY_CONFIG.MAX_DELAY);

    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, nextDelay);
  }
};

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
      return retryWithBackoff(async () => {
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

          // Validate response data first
          if (!response.data) {
            throw new AppError({
              code: ErrorCode.INVALID_RESPONSE,
              message: 'Empty response received',
            });
          }

          // Validate transitions and force refresh if needed
          if (response.data?.daily?.transitions) {
            const currentStatus = {
              state: response.data.base.state,
              checkStatus: response.data.base.checkStatus,
              isOvertime: response.data.base.periodInfo.isOvertime,
              overtimeState: response.data.base.periodInfo.overtimeState,
            };

            const shouldForceRefresh =
              StatusHelpers.isInOvertime(currentStatus) &&
              response.data.base.latestAttendance?.CheckOutTime &&
              response.data.daily.transitions.length > 0;

            if (shouldForceRefresh) {
              await mutate(response.data, false);
            }
          }

          // Sanitize and validate the response
          const sanitized = sanitizeResponse(response.data);
          validateAttendanceResponse(sanitized);

          return sanitized;
        } catch (error) {
          if (axios.isAxiosError(error)) {
            // Handle specific HTTP errors
            if (error.response?.status === 503) {
              throw new AppError({
                code: ErrorCode.SERVICE_UNAVAILABLE,
                message: 'Service temporarily unavailable',
                originalError: error,
              });
            }
            if (error.response?.status === 500) {
              throw new AppError({
                code: ErrorCode.SERVER_ERROR,
                message: 'Internal server error occurred',
                originalError: error,
              });
            }
          }
          throw handleAttendanceError(error);
        }
      });
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

  // Add validation for attendance response
  const validateAttendanceResponse = (data: AttendanceStatusResponse) => {
    if (!data.daily || !data.base || !data.context || !data.validation) {
      throw new AppError({
        code: ErrorCode.INVALID_RESPONSE,
        message: 'Invalid response structure',
      });
    }

    // Validate time window
    const timeWindow = data.daily.currentState?.timeWindow;
    if (timeWindow && (!timeWindow.start || !timeWindow.end)) {
      console.warn('Invalid time window:', timeWindow);
    }

    // Validate shift times
    const shift = data.context.shift;
    if (shift && (!shift.startTime || !shift.endTime)) {
      console.warn('Invalid shift times:', shift);
    }
  };

  const checkInOut = useCallback(
    async (params: CheckInOutData) => {
      try {
        // Validate state transition before making API call
        if (data?.base) {
          const currentStatus = {
            state: data.base.state,
            checkStatus: data.base.checkStatus,
            isOvertime: data.base.periodInfo.isOvertime,
            overtimeState: data.base.periodInfo.overtimeState,
          };

          if (params.isCheckIn && !StatusHelpers.canCheckIn(currentStatus)) {
            throw new AppError({
              code: ErrorCode.PROCESSING_ERROR,
              message: 'Invalid check-in attempt',
            });
          }

          if (!params.isCheckIn && !StatusHelpers.canCheckOut(currentStatus)) {
            throw new AppError({
              code: ErrorCode.PROCESSING_ERROR,
              message: 'Invalid check-out attempt',
            });
          }
        }

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
    [employeeId, lineUserId, locationState, mutate, data],
  );

  // Updated sanitizeResponse to handle new structure
  const sanitizeResponse = (data: any): AttendanceStatusResponse => {
    // Handle daily state
    const daily = {
      date: data.daily.date,
      currentState: sanitizePeriodState(data.daily.currentState),
      transitions: Array.isArray(data.daily.transitions)
        ? data.daily.transitions
        : [],
    };

    // Handle base response
    const base = {
      ...data.base,
      validation: {
        canCheckIn: Boolean(data.base.validation?.canCheckIn),
        canCheckOut: Boolean(data.base.validation?.canCheckOut),
        message: data.base.validation?.message || '',
      },
      metadata: {
        lastUpdated:
          data.base.metadata?.lastUpdated || getCurrentTime().toISOString(),
        version: data.base.metadata?.version || 1,
        source: data.base.metadata?.source || 'system',
      },
    };

    // Handle context
    const context: ShiftContext & TransitionContext = {
      shift: {
        id: data.context?.shift?.id || '',
        shiftCode: data.context?.shift?.shiftCode || '',
        name: data.context?.shift?.name || '',
        startTime: data.context?.shift?.startTime || '',
        endTime: data.context?.shift?.endTime || '',
        workDays: Array.isArray(data.context?.shift?.workDays)
          ? data.context.shift.workDays
          : [],
      },
      schedule: {
        isHoliday: Boolean(data.context?.schedule?.isHoliday),
        isDayOff: Boolean(data.context?.schedule?.isDayOff),
        isAdjusted: Boolean(data.context?.schedule?.isAdjusted),
        holidayInfo: data.context?.schedule?.holidayInfo,
      },
      nextPeriod: data.context?.nextPeriod || null,
      transition: data.context?.transition,
    };

    // Handle validation
    const validation: StateValidation = {
      allowed: Boolean(data.validation?.allowed),
      reason: data.validation?.reason || '',
      flags: {
        hasActivePeriod: Boolean(data.validation?.flags?.hasActivePeriod),
        isInsideShift: Boolean(data.validation?.flags?.isInsideShift),
        isOutsideShift: Boolean(data.validation?.flags?.isOutsideShift),
        isEarlyCheckIn: Boolean(data.validation?.flags?.isEarlyCheckIn),
        isLateCheckIn: Boolean(data.validation?.flags?.isLateCheckIn),
        isEarlyCheckOut: Boolean(data.validation?.flags?.isEarlyCheckOut),
        isLateCheckOut: Boolean(data.validation?.flags?.isLateCheckOut),
        isVeryLateCheckOut: Boolean(data.validation?.flags?.isVeryLateCheckOut),
        isOvertime: Boolean(data.validation?.flags?.isOvertime),
        isPendingOvertime: Boolean(data.validation?.flags?.isPendingOvertime),
        isDayOffOvertime: Boolean(data.validation?.flags?.isDayOffOvertime),
        isAutoCheckIn: Boolean(data.validation?.flags?.isAutoCheckIn),
        isAutoCheckOut: Boolean(data.validation?.flags?.isAutoCheckOut),
        requiresAutoCompletion: Boolean(
          data.validation?.flags?.requiresAutoCompletion,
        ),
        hasPendingTransition: daily.transitions.length > 0,
        requiresTransition: Boolean(data.validation?.flags?.requiresTransition),
        isAfternoonShift: Boolean(data.validation?.flags?.isAfternoonShift),
        isMorningShift: Boolean(data.validation?.flags?.isMorningShift),
        isAfterMidshift: Boolean(data.validation?.flags?.isAfterMidshift),
        isApprovedEarlyCheckout: Boolean(
          data.validation?.flags?.isApprovedEarlyCheckout,
        ),
        isPlannedHalfDayLeave: Boolean(
          data.validation?.flags?.isPlannedHalfDayLeave,
        ),
        isEmergencyLeave: Boolean(data.validation?.flags?.isEmergencyLeave),
        isHoliday: Boolean(data.validation?.flags?.isHoliday),
        isDayOff: Boolean(data.validation?.flags?.isDayOff),
        isManualEntry: Boolean(data.validation?.flags?.isManualEntry),
      },
      metadata: data.validation?.metadata,
    };

    return {
      daily,
      base,
      context,
      validation,
    };
  };

  // Helper to sanitize period state
  const sanitizePeriodState = (state: any): UnifiedPeriodState => {
    if (!state) return {} as UnifiedPeriodState;

    return {
      type: state.type,
      timeWindow: {
        start: state.timeWindow?.start || '',
        end: state.timeWindow?.end || '',
      },
      activity: {
        isActive: Boolean(state.activity?.isActive),
        checkIn: state.activity?.checkIn || null,
        checkOut: state.activity?.checkOut || null,
        isOvertime: Boolean(state.activity?.isOvertime),
        isDayOffOvertime: Boolean(state.activity?.isDayOffOvertime),
        isInsideShiftHours: Boolean(state.activity?.isInsideShiftHours),
      },
      validation: {
        isWithinBounds: Boolean(state.validation?.isWithinBounds),
        isEarly: Boolean(state.validation?.isEarly),
        isLate: Boolean(state.validation?.isLate),
        isOvernight: Boolean(state.validation?.isOvernight),
        isConnected: Boolean(state.validation?.isConnected),
      },
    };
  };

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
      } catch (error) {
        console.error('Error refreshing attendance status:', error);
        if (options?.throwOnError) {
          throw error;
        }
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
    refreshAttendanceStatus: Object.assign(refreshAttendanceStatus, {
      mutate,
    }),
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
