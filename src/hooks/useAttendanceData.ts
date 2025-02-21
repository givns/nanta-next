// hooks/useAttendanceData.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
  ProcessingResult,
  CheckInOutData,
  AppError,
  ErrorCode,
  AttendanceStatusResponse,
  UseAttendanceDataProps,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { format } from 'date-fns';

const REQUEST_TIMEOUT = 40000;
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 5000,
};

interface UseAttendanceDataState {
  isRefreshing: boolean;
  lastOperation: string | null;
  lastError: Error | null;
  pendingRequests: Set<string>;
  retryCount: number;
}

const sanitizeResponse = (data: any): AttendanceStatusResponse => {
  console.log('Sanitizing response data:', {
    hasBase: !!data.base,
    hasContext: !!data.context,
    hasDaily: !!data.daily,
  });

  // Check for null/undefined data
  if (!data || !data.base || !data.context || !data.daily) {
    console.error('Invalid response data structure:', data);
    throw new AppError({
      code: ErrorCode.INVALID_RESPONSE,
      message: 'Invalid or incomplete response data',
    });
  }

  try {
    // Daily state sanitization
    const daily = {
      date: data.daily.date || format(getCurrentTime(), 'yyyy-MM-dd'),
      currentState: data.daily.currentState || {
        type: 'REGULAR',
        timeWindow: {
          start: getCurrentTime().toISOString(),
          end: getCurrentTime().toISOString(),
        },
        activity: {
          isActive: false,
          checkIn: null,
          checkOut: null,
        },
        validation: {},
      },
      transitions: Array.isArray(data.daily.transitions)
        ? data.daily.transitions
        : [],
    };

    // Base state sanitization
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

    // Context sanitization with fallbacks
    const context = {
      shift: {
        id: data.context.shift?.id || '',
        shiftCode: data.context.shift?.shiftCode || '',
        name: data.context.shift?.name || '',
        startTime: data.context.shift?.startTime || '',
        endTime: data.context.shift?.endTime || '',
        workDays: Array.isArray(data.context.shift?.workDays)
          ? data.context.shift.workDays
          : [],
      },
      schedule: {
        isHoliday: Boolean(data.context.schedule?.isHoliday),
        isDayOff: Boolean(data.context.schedule?.isDayOff),
        isAdjusted: Boolean(data.context.schedule?.isAdjusted),
        holidayInfo: data.context.schedule?.holidayInfo,
      },
      nextPeriod: data.context.nextPeriod,
      transition: data.context.transition,
    };

    // Validation state sanitization
    const validation = {
      allowed: Boolean(data.validation?.allowed),
      reason: data.validation?.reason || '',
      flags: {
        ...(data.validation?.flags || {}),
        hasPendingTransition: daily.transitions.length > 0,
      },
      metadata: data.validation?.metadata || {},
    };

    return {
      daily,
      base,
      context,
      validation,
    };
  } catch (error) {
    console.error('Error sanitizing response:', error);
    throw new AppError({
      code: ErrorCode.INVALID_RESPONSE,
      message: 'Failed to process response data',
      originalError: error,
    });
  }
};

// Improved error handling
function handleAttendanceError(error: unknown): AppError {
  console.error('Handling attendance error:', error);

  if (error instanceof AppError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return new AppError({
        code: ErrorCode.TIMEOUT,
        message: 'Request timed out',
        details: {
          timeout: REQUEST_TIMEOUT,
          url: error.config?.url,
        },
        originalError: error,
      });
    }

    if (error.response?.status === 404) {
      return new AppError({
        code: ErrorCode.NOT_FOUND,
        message: 'Attendance record not found',
        originalError: error,
      });
    }

    // Handle 500 errors specially
    if (error.response?.status === 500) {
      let errorMessage = 'Internal server error';

      // Try to extract more detailed error info
      try {
        if (
          typeof error.response.data === 'object' &&
          error.response.data.message
        ) {
          errorMessage = error.response.data.message;

          // Special handling for MongoDB ObjectID errors
          if (
            errorMessage.includes('Malformed ObjectID') &&
            errorMessage.includes('provided hex string representation')
          ) {
            return new AppError({
              code: ErrorCode.INVALID_ID_FORMAT,
              message: 'Employee ID format is invalid',
              details: {
                employeeId: true,
                suggestion: 'Please check the employee ID format',
              },
              originalError: error,
            });
          }
        }
      } catch (e) {
        console.error('Error parsing error response:', e);
      }

      return new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: errorMessage,
        details: {
          status: error.response?.status,
          data: error.response?.data,
        },
        originalError: error,
      });
    }

    return new AppError({
      code: ErrorCode.NETWORK_ERROR,
      message: error.message,
      details: {
        status: error.response?.status,
        data: error.response?.data,
      },
      originalError: error,
    });
  }

  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    originalError: error,
  });
}

// Implement exponential backoff retry logic
const backoffRetry = async <T>(
  fn: () => Promise<T>,
  retries: number,
  initialDelay: number,
  maxDelay: number,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    const delay = Math.min(
      initialDelay * Math.pow(2, RETRY_CONFIG.MAX_RETRIES - retries),
      maxDelay,
    );
    console.log(`Retrying after ${delay}ms. Retries left: ${retries}`);

    await new Promise((resolve) => setTimeout(resolve, delay));
    return backoffRetry(fn, retries - 1, initialDelay, maxDelay);
  }
};

export function useAttendanceData({
  employeeId,
  lineUserId,
  locationState,
  locationReady,
  locationVerified,
  initialAttendanceStatus,
  enabled = true,
}: UseAttendanceDataProps) {
  // State management
  const [state, setState] = useState<UseAttendanceDataState>({
    isRefreshing: false,
    lastOperation: null,
    lastError: null,
    pendingRequests: new Set(),
    retryCount: 0,
  });
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized conditions
  const shouldFetch =
    enabled && employeeId && locationReady && locationVerified;

  console.log('Attendance data hook state:', {
    enabled,
    employeeId,
    locationState: {
      status: locationState.status,
      verificationStatus: locationState.verificationStatus,
      inPremises: locationState.inPremises,
    },
    shouldFetch,
  });

  // SWR configuration with more robust error handling
  const { data, error, mutate } = useSWR<AttendanceStatusResponse>(
    shouldFetch
      ? [
          '/api/attendance/status/[employeeId]',
          employeeId,
          locationState,
          state.lastOperation,
        ]
      : null,
    async ([_, id]): Promise<AttendanceStatusResponse> => {
      try {
        // Prepare coordinates in a format that works with our updated API
        const coordinates = locationState.coordinates
          ? JSON.stringify({
              lat: locationState.coordinates.lat,
              lng: locationState.coordinates.lng,
            })
          : undefined;

        const fetchData = async () => {
          const response = await axios.get(`/api/attendance/status/${id}`, {
            params: {
              inPremises:
                locationState.verificationStatus === 'verified'
                  ? true
                  : locationState.inPremises,
              address: locationState.address || '',
              confidence: locationState.confidence || 'low',
              coordinates,
              adminVerified: locationState.verificationStatus === 'verified',
              _t: new Date().getTime(),
            },
            timeout: REQUEST_TIMEOUT,
          });

          if (!response.data) {
            throw new AppError({
              code: ErrorCode.INVALID_RESPONSE,
              message: 'Empty response received',
            });
          }

          console.log('Raw API response:', response.data);
          return response.data;
        };

        // Implement retry with backoff logic
        const responseData = await backoffRetry(
          fetchData,
          RETRY_CONFIG.MAX_RETRIES,
          RETRY_CONFIG.INITIAL_DELAY,
          RETRY_CONFIG.MAX_DELAY,
        );

        // Use sanitizeResponse to ensure consistent data structure
        const sanitized = sanitizeResponse(responseData);
        console.log('Sanitized response:', sanitized);

        // Reset retry count on success
        setState((prev) => ({
          ...prev,
          retryCount: 0,
        }));

        return sanitized;
      } catch (error) {
        // Increment retry count on error
        setState((prev) => ({
          ...prev,
          retryCount: prev.retryCount + 1,
        }));

        throw handleAttendanceError(error);
      }
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 5000,
      fallbackData: initialAttendanceStatus,
      onError: (error) => {
        setState((prev) => ({ ...prev, lastError: error as Error }));
        console.error('SWR Error:', error);
      },
      revalidateOnMount: true,
      shouldRetryOnError: true,
      errorRetryCount: RETRY_CONFIG.MAX_RETRIES,
    },
  );

  useEffect(() => {
    if (shouldFetch && !data) {
      console.log('Conditions met, triggering data refresh');
      mutate();
    }
  }, [shouldFetch, data, mutate]);

  useEffect(() => {
    console.log('Attendance data changed:', {
      hasData: !!data,
      employeeId,
      timestamp: new Date().toISOString(),
    });
  }, [data, employeeId]);

  // Refresh attendance status with retry logic
  const refreshAttendanceStatus = useCallback(async () => {
    if (state.isRefreshing) return;

    try {
      setState((prev) => ({ ...prev, isRefreshing: true }));

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      const timestamp = getCurrentTime().toISOString();
      setState((prev) => ({
        ...prev,
        lastOperation: `refresh-${timestamp}`,
      }));

      // Clear cache first
      try {
        await axios.post(`/api/attendance/clear-cache`, {
          employeeId,
          timestamp,
        });
      } catch (error) {
        console.warn('Failed to clear server cache:', error);
      }

      await mutate();
    } catch (error) {
      console.error('Error refreshing attendance status:', error);
      setState((prev) => ({ ...prev, lastError: error as Error }));
    } finally {
      setState((prev) => ({ ...prev, isRefreshing: false }));
    }
  }, [employeeId, mutate, state.isRefreshing]);

  // Check in/out handler
  const checkInOut = useCallback(
    async (params: CheckInOutData) => {
      const requestId = `${params.isCheckIn ? 'checkin' : 'checkout'}-${Date.now()}`;

      try {
        setState((prev) => ({
          ...prev,
          pendingRequests: new Set([...prev.pendingRequests, requestId]),
          lastOperation: requestId, // Update lastOperation here
        }));

        console.log('Processing attendance request:', {
          type: params.periodType,
          isCheckIn: params.activity.isCheckIn,
          timestamp: format(new Date(params.checkTime), 'HH:mm:ss'),
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

        setState((prev) => ({
          ...prev,
          pendingRequests: new Set(
            [...prev.pendingRequests].filter((id) => id !== requestId),
          ),
        }));

        await refreshAttendanceStatus();
        return response.data;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          lastError: error as Error,
          pendingRequests: new Set(
            [...prev.pendingRequests].filter((id) => id !== requestId),
          ),
        }));
        throw handleAttendanceError(error);
      }
    },
    [employeeId, lineUserId, locationState, refreshAttendanceStatus],
  );

  return {
    data,
    error: error || state.lastError,
    isLoading: !data && !error,
    isRefreshing: state.isRefreshing,
    refreshAttendanceStatus,
    checkInOut,
    mutate,
  };
}
