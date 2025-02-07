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
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { StatusHelpers } from '@/services/Attendance/utils/StatusHelper';

const REQUEST_TIMEOUT = 40000;
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 5000,
};

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries = RETRY_CONFIG.MAX_RETRIES,
  delay = RETRY_CONFIG.INITIAL_DELAY,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    const nextDelay = Math.min(delay * 2, RETRY_CONFIG.MAX_DELAY);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, nextDelay);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastOperation, setLastOperation] = useState<string>('');
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();

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

  const { data, error, mutate } = useSWR<AttendanceStatusResponse>(
    shouldFetch
      ? [
          '/api/attendance/status/[employeeId]',
          employeeId,
          locationState,
          lastOperation,
        ]
      : null,

    async ([_, id]): Promise<AttendanceStatusResponse> => {
      console.log('Fetching attendance data for:', {
        employeeId: id,
        lastOperation,
        locationState,
        timestamp: new Date().toISOString(),
      });

      try {
        const response = await axios.get(`/api/attendance/status/${id}`, {
          params: {
            inPremises:
              locationState.verificationStatus === 'verified'
                ? true
                : locationState.inPremises,
            address: locationState.address,
            confidence: locationState.confidence,
            coordinates: locationState.coordinates,
            adminVerified: locationState.verificationStatus === 'verified',
            _t: new Date().getTime(),
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

        if (!response.data.context?.shift?.id) {
          console.error('Missing shift data in response');
          throw new AppError({
            code: ErrorCode.INVALID_RESPONSE,
            message: 'Invalid shift data received',
          });
        }

        const sanitized = sanitizeResponse(response.data);
        console.log('Sanitized response:', sanitized);

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
      revalidateOnMount: true,
      shouldRetryOnError: true,
      errorRetryCount: 3,
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
      lastOperation,
      timestamp: new Date().toISOString(),
    });
  }, [data, employeeId, lastOperation]);

  const refreshAttendanceStatus = useCallback(async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      // Force a new timestamp for the operation
      const timestamp = new Date().toISOString();
      setLastOperation(timestamp);

      // Clear cache first
      try {
        await axios.post(`/api/attendance/clear-cache`, {
          employeeId,
          timestamp,
        });
      } catch (error) {
        console.warn('Failed to clear server cache:', error);
      }

      // Then mutate data
      await mutate(undefined, {
        revalidate: true,
        populateCache: true,
      });
    } catch (error) {
      console.error('Error refreshing attendance status:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, mutate, employeeId]);

  const checkInOut = useCallback(
    async (params: CheckInOutData) => {
      try {
        console.log('Attendance data request:', {
          originalCheckTime: params.checkTime,
          currentTime: getCurrentTime(),
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

        console.log('Check-in/out response:', {
          success: response.data.success,
          hasData: !!response.data.data,
          processingTime: response.data.timestamp,
        });

        setLastOperation(
          `${params.isCheckIn ? 'checkin' : 'checkout'}-${new Date().toISOString()}`,
        );

        // Use the existing refresh function to get fresh data
        await refreshAttendanceStatus();

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
    [employeeId, lineUserId, locationState, refreshAttendanceStatus],
  );

  // Add debug logging for data changes
  useEffect(() => {
    if (data) {
      console.log('useAttendanceData state update:', {
        hasDaily: !!data.daily,
        hasBase: !!data.base,
        hasContext: !!data.context,
        timestamp: new Date().toISOString(),
      });
    }
  }, [data]);

  const sanitizeResponse = (data: any): AttendanceStatusResponse => {
    console.log('Sanitizing response data:', {
      hasBase: !!data.base,
      hasContext: !!data.context,
      hasDaily: !!data.daily,
    });

    const daily = {
      date: data.daily.date,
      currentState: data.daily.currentState,
      transitions: Array.isArray(data.daily.transitions)
        ? data.daily.transitions
        : [],
    };

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

    const validation = {
      allowed: Boolean(data.validation.allowed),
      reason: data.validation.reason || '',
      flags: {
        ...data.validation.flags,
        hasPendingTransition: daily.transitions.length > 0,
      },
      metadata: data.validation.metadata,
    };

    return {
      daily,
      base,
      context,
      validation,
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
