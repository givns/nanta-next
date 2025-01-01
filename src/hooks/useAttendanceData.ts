// hooks/useAttendanceData.ts
import { useCallback, useEffect, useRef, useState } from 'react';
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

// hooks/useAttendanceData.ts
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
      console.log('Fetching attendance data for:', id); // Debug log
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

        console.log('Raw API response:', response.data);

        if (!response.data) {
          throw new AppError({
            code: ErrorCode.INVALID_RESPONSE,
            message: 'Empty response received',
          });
        }

        // Validate required fields
        if (!response.data.context?.shift?.id) {
          console.error('Missing shift data in response');
          throw new AppError({
            code: ErrorCode.INVALID_RESPONSE,
            message: 'Invalid shift data received',
          });
        }

        // Sanitize and validate the response
        const sanitized = sanitizeResponse(response.data);
        console.log('Sanitized response:', sanitized);

        // Log the final data being returned
        console.log('Returning attendance data:', {
          hasData: true,
          employeeId,
          context: sanitized.context,
          base: sanitized.base,
          validation: sanitized.validation,
        });

        return sanitized;
      } catch (error) {
        console.error('Fetch error:', error);
        throw error;
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
      // Add these SWR options to help with data persistence
      revalidateOnMount: true,
      shouldRetryOnError: true,
      errorRetryCount: 3,
    },
  );

  // Add effect to handle location state changes
  useEffect(() => {
    if (locationState.status === 'ready' && !data) {
      console.log('Location ready, triggering data refresh');
      mutate();
    }
  }, [locationState.status, data, mutate]);

  // Add effect to track data changes
  useEffect(() => {
    console.log('useAttendanceData data changed:', {
      hasData: !!data,
      employeeId,
      context: data?.context,
      base: data?.base,
      validation: data?.validation,
    });
  }, [data, employeeId]);

  const refreshAttendanceStatus = useCallback(async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      await mutate(undefined, { revalidate: true });
    } catch (error) {
      console.error('Error refreshing attendance status:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, mutate]);

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
    // First, log what we received
    console.log('Sanitizing response data:', {
      hasBase: !!data.base,
      hasContext: !!data.context,
      hasDaily: !!data.daily,
    });

    // Handle daily state
    const daily = {
      date: data.daily.date,
      currentState: data.daily.currentState,
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
    const context = {
      shift: {
        id: data.context.shift.id,
        shiftCode: data.context.shift.shiftCode,
        name: data.context.shift.name,
        startTime: data.context.shift.startTime,
        endTime: data.context.shift.endTime,
        workDays: Array.isArray(data.context.shift.workDays)
          ? data.context.shift.workDays
          : [],
      },
      schedule: {
        isHoliday: Boolean(data.context.schedule.isHoliday),
        isDayOff: Boolean(data.context.schedule.isDayOff),
        isAdjusted: Boolean(data.context.schedule.isAdjusted),
        holidayInfo: data.context.schedule.holidayInfo,
      },
      nextPeriod: data.context.nextPeriod,
      transition: data.context.transition,
    };

    // Handle validation
    const validation = {
      allowed: Boolean(data.validation.allowed),
      reason: data.validation.reason || '',
      flags: {
        ...data.validation.flags,
        hasPendingTransition: daily.transitions.length > 0,
      },
      metadata: data.validation.metadata,
    };

    // Log what we're returning
    console.log('Sanitized result:', {
      hasBase: true,
      hasContext: true,
      hasDaily: true,
      transitions: daily.transitions.length,
      shiftId: context.shift.id,
    });

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
