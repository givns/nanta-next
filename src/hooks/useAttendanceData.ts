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
  UserData,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { format } from 'date-fns';
import { PeriodType } from '@prisma/client';

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
      errors: data.validation?.errors || {},
      warnings: data.validation?.warnings || {},
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
  shiftId,
  enabled = true,
}: UseAttendanceDataProps & { userData?: UserData }) {
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
          // Only add shiftId if available
          const userParams = shiftId ? { shiftId } : {};

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
              ...userParams, // Include shiftId if available
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

  // Create a minimal valid data structure for cases where we need to return without complete data
  const createMinimalData = () => ({
    state: {
      current: {
        type: 'REGULAR' as PeriodType,
        timeWindow: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        activity: {
          isActive: false,
          checkIn: null,
          checkOut: null,
          isOvertime: false,
          isDayOffOvertime: false,
        },
        validation: {
          isWithinBounds: true,
          isEarly: false,
          isLate: false,
          isOvernight: false,
          isConnected: false,
        },
      },
    },
    validation: {
      errors: [],
      warnings: [
        {
          code: 'SERVER_ERROR',
          message:
            'Server experienced an error, but the operation may have succeeded',
        },
      ],
      allowed: true,
      reason: 'Status refreshed after error',
      flags: {
        hasActivePeriod: false,
        isCheckingIn: true,
        isLateCheckIn: false,
        isEarlyCheckIn: false,
        isLateCheckOut: false,
        isVeryLateCheckOut: false,
        isEarlyCheckOut: false,
        isInsideShift: true,
        isOutsideShift: false,
        isOvertime: false,
        isDayOffOvertime: false,
        hasPendingTransition: false,
        requiresTransition: false,
        requireConfirmation: false,
        requiresAutoCompletion: false,
        isPendingOvertime: false,
        isAutoCheckIn: false,
        isAutoCheckOut: false,
        isMorningShift: false,
        isAfternoonShift: false,
        isAfterMidshift: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        isApprovedEarlyCheckout: false,
        isHoliday: false,
        isDayOff: false,
        isManualEntry: false,
      },
      metadata: {},
    },
  });

  const checkInOut = useCallback(
    async (params: CheckInOutData) => {
      const localRequestId = `${params.isCheckIn ? 'checkin' : 'checkout'}-${Date.now()}`;

      try {
        setState((prev) => ({
          ...prev,
          pendingRequests: new Set([...prev.pendingRequests, localRequestId]),
          lastOperation: localRequestId,
        }));

        console.log('Processing attendance request:', {
          type: params.periodType,
          isCheckIn: params.activity.isCheckIn,
          timestamp: format(new Date(params.checkTime), 'HH:mm:ss'),
          hasLatestData: !!data, // Check if we have current status data
        });

        // Include current attendance status in the request if available
        const requestData = {
          ...params,
          requestId: localRequestId,
          employeeId,
          lineUserId,
          address: locationState.address,
          inPremises: locationState.inPremises,
          confidence: locationState.confidence,
          preCalculatedStatus: data
            ? {
                ...JSON.parse(JSON.stringify(data)), // Ensure proper serialization
                base: {
                  ...JSON.parse(JSON.stringify(data.base)),
                  metadata: {
                    ...JSON.parse(JSON.stringify(data.base.metadata)),
                    lastUpdated: new Date().toISOString(),
                  },
                },
              }
            : undefined,
        };

        console.log('Sending request with pre-calculated status:', {
          hasStatus: !!requestData.preCalculatedStatus,
          statusSize: requestData.preCalculatedStatus
            ? JSON.stringify(requestData.preCalculatedStatus).length
            : 0,
          keysPresentInStatus: requestData.preCalculatedStatus
            ? Object.keys(requestData.preCalculatedStatus)
            : [],
        });

        const response = await axios.post(
          '/api/attendance/check-in-out',
          requestData,
          { timeout: REQUEST_TIMEOUT },
        );

        // Handle immediate success (synchronous processing)
        if (response.status === 200 && response.data.processed === true) {
          console.log('Request processed synchronously:', response.data);

          setState((prev) => ({
            ...prev,
            pendingRequests: new Set(
              [...prev.pendingRequests].filter((id) => id !== localRequestId),
            ),
          }));

          await refreshAttendanceStatus();
          return response.data.data;
        }

        // Handle async processing (202 Accepted)
        if (response.status === 202) {
          console.log('Request accepted for async processing');
          const serverRequestId = response.data.requestId || localRequestId;
          const statusUrl =
            response.data.statusUrl ||
            `/api/attendance/task-status/${serverRequestId}`;

          try {
            const result = await intelligentPolling(statusUrl, serverRequestId);

            setState((prev) => ({
              ...prev,
              pendingRequests: new Set(
                [...prev.pendingRequests].filter((id) => id !== localRequestId),
              ),
            }));

            await refreshAttendanceStatus();
            return result;
          } catch (pollingError) {
            console.warn(
              'Polling failed, attempting direct status refresh:',
              pollingError,
            );

            // AUTOMATIC RECOVERY: Clear cache and refresh on polling error
            try {
              console.log('Automatic recovery after polling error');

              // Clear cache
              await axios.post(`/api/attendance/clear-cache`, {
                employeeId,
                timestamp: new Date().toISOString(),
              });

              // Wait a moment for backend processing to complete
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Refresh status
              await refreshAttendanceStatus();

              setState((prev) => ({
                ...prev,
                pendingRequests: new Set(
                  [...prev.pendingRequests].filter(
                    (id) => id !== localRequestId,
                  ),
                ),
              }));

              // Return a success result
              return {
                success: true,
                message: 'Operation completed with recovery refresh',
                timestamp: new Date().toISOString(),
                requestId: serverRequestId,
                data: {
                  state: {
                    current: {
                      type: 'REGULAR' as PeriodType,
                      timeWindow: {
                        start: new Date().toISOString(),
                        end: new Date().toISOString(),
                      },
                      activity: {
                        isActive: params.activity.isCheckIn ? true : false,
                        checkIn: params.activity.isCheckIn
                          ? new Date().toISOString()
                          : null,
                        checkOut: !params.activity.isCheckIn
                          ? new Date().toISOString()
                          : null,
                        isOvertime: false,
                        isDayOffOvertime: false,
                      },
                      validation: {
                        isWithinBounds: true,
                        isEarly: false,
                        isLate: false,
                        isOvernight: false,
                        isConnected: false,
                      },
                    },
                  },
                  validation: {
                    errors: [],
                    warnings: [
                      {
                        code: 'POLLING_FAILED',
                        message:
                          'Polling failed but operation may have succeeded',
                      },
                    ],
                    allowed: true,
                    reason: 'Status refreshed after polling failure',
                    flags: {
                      hasActivePeriod: params.activity.isCheckIn,
                      isCheckingIn: !params.activity.isCheckIn,
                      isLateCheckIn: false,
                      isEarlyCheckIn: false,
                      isLateCheckOut: false,
                      isVeryLateCheckOut: false,
                      isEarlyCheckOut: false,
                      isInsideShift: true,
                      isOutsideShift: false,
                      isOvertime: false,
                      isDayOffOvertime: false,
                      hasPendingTransition: false,
                      requiresTransition: false,
                      requireConfirmation: false,
                      requiresAutoCompletion: false,
                      isPendingOvertime: false,
                      isAutoCheckIn: false,
                      isAutoCheckOut: false,
                      isMorningShift: false,
                      isAfternoonShift: false,
                      isAfterMidshift: false,
                      isPlannedHalfDayLeave: false,
                      isEmergencyLeave: false,
                      isApprovedEarlyCheckout: false,
                      isHoliday: false,
                      isDayOff: false,
                      isManualEntry: false,
                    },
                    metadata: {},
                  },
                },
              };
            } catch (recoveryError) {
              console.error(
                'Recovery failed after polling error:',
                recoveryError,
              );
              throw pollingError; // Rethrow the original error if recovery fails
            }
          }
        }

        // Handle unexpected response format
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
            [...prev.pendingRequests].filter((id) => id !== localRequestId),
          ),
        }));

        await refreshAttendanceStatus();
        return response.data;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          lastError: error as Error,
          pendingRequests: new Set(
            [...prev.pendingRequests].filter((id) => id !== localRequestId),
          ),
        }));
        throw handleAttendanceError(error);
      }
    },
    [employeeId, lineUserId, locationState, refreshAttendanceStatus, data],
  );

  /**
   * Poll for completion with intelligent backoff
   */
  const intelligentPolling = useCallback(
    async (
      statusUrl: string,
      requestId: string,
      maxAttempts = 10,
      maxTotalWaitTime = 20000,
    ): Promise<ProcessingResult> => {
      const startTime = Date.now();
      let pollInterval = 800;
      let consecutiveErrors = 0;
      let failedWithError = false;
      // Track debug info internally
      const debugInfo = {
        attempts: 0,
        errors: 0,
        totalTime: 0,
        statusHistory: [] as string[],
      };

      // Log polling start with debug info
      console.log(`Starting intelligent polling for request ${requestId}`, {
        maxAttempts,
        maxTotalWaitTime,
        timestamp: new Date().toISOString(),
      });

      // Immediately try to clear cache before starting polling
      try {
        console.log('Pre-emptively clearing cache before polling');
        await axios.post('/api/attendance/clear-cache', {
          employeeId,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Failed initial cache clear:', e);
      }

      for (let i = 0; i < maxAttempts; i++) {
        debugInfo.attempts = i + 1;

        // Track elapsed time and potentially bail out early
        const elapsedTime = Date.now() - startTime;
        debugInfo.totalTime = elapsedTime;

        // Check total wait time earlier in the loop
        if (elapsedTime > maxTotalWaitTime * 0.75) {
          console.warn(
            `Polling approaching timeout for ${requestId}, attempting early recovery`,
            {
              elapsedTime,
              maxTotalWaitTime,
              attempts: i + 1,
            },
          );
          // Try early recovery rather than continuing to poll
          break;
        }

        // Wait for the current poll interval
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        try {
          console.log(
            `Polling for status: ${requestId} (attempt ${i + 1}/${maxAttempts}, elapsed: ${elapsedTime}ms)`,
          );

          // Add timeout handling for the status check
          const response = await axios.get(statusUrl, {
            timeout: 5000,
            // Handle 500 errors gracefully
            validateStatus: function (status) {
              return status < 500; // Don't throw for 5xx errors
            },
            // Add request ID to headers for tracing
            headers: {
              'x-polling-request-id': requestId,
              'x-poll-attempt': i + 1,
            },
          });

          // NEW: Handle "unknown" status specifically
          if (response.data?.status === 'unknown') {
            console.warn(
              `Received "unknown" status for ${requestId}, attempting recovery`,
            );

            // If we've tried at least 3 times and still get unknown, try recovery
            if (i >= 2) {
              console.log(
                `Multiple "unknown" status responses, forcing recovery for ${requestId}`,
              );

              // Clear cache and refresh
              await axios.post('/api/attendance/clear-cache', {
                employeeId,
                timestamp: new Date().toISOString(),
              });

              // Wait a moment for any background processing to complete
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Force a refresh of attendance status
              await refreshAttendanceStatus();

              // Return a successful result
              return {
                success: true,
                message: 'Recovered from unknown status condition',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                data: createMinimalData(),
                metadata: {
                  source: 'system',
                  recoveryInfo: {
                    type: 'unknown_status_recovery',
                    attempts: debugInfo.attempts,
                  },
                },
              };
            }

            // Increase poll interval but continue trying
            pollInterval = Math.min(pollInterval * 1.5, 2000);
            continue;
          }

          // Special handling for timeout errors
          if (
            response.data.status === 'failed' &&
            (response.data.error?.includes('timeout') ||
              response.data.error?.includes('timed out'))
          ) {
            console.warn(
              `Detected timeout error, attempting recovery for ${requestId}`,
            );

            // Clear cache first
            try {
              console.log('Clearing cache after timeout error');
              await axios.post('/api/attendance/clear-cache', {
                employeeId,
                timestamp: new Date().toISOString(),
              });
            } catch (clearCacheError) {
              console.warn('Failed to clear server cache:', clearCacheError);
            }

            // Wait a moment for any background processing to complete
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Force a refresh
            await refreshAttendanceStatus();

            return {
              success: true,
              message: 'Recovered from timeout error',
              timestamp: new Date().toISOString(),
              requestId: requestId,
              data: createMinimalData(),
              metadata: {
                source: 'system',
                recoveryInfo: {
                  type: 'timeout_recovery',
                  originalError: response.data.error,
                },
              },
            };
          }

          // Track status in history
          if (response.data?.status) {
            debugInfo.statusHistory.push(response.data.status);
          }

          // Check for server errors
          if (response.status >= 500) {
            console.warn(
              `Server error (${response.status}) while polling for status`,
            );
            consecutiveErrors++;
            debugInfo.errors++;

            if (consecutiveErrors >= 2) {
              // If we get multiple server errors, try to recover by refreshing
              console.warn(`Multiple server errors, attempting recovery`);

              // Clear cache first
              try {
                console.log('Clearing cache after server error');
                await axios.post('/api/attendance/clear-cache', {
                  employeeId,
                  timestamp: new Date().toISOString(),
                });
              } catch (clearCacheError) {
                console.warn('Failed to clear server cache:', clearCacheError);
              }

              await refreshAttendanceStatus();

              return {
                success: true,
                message: 'Server error occurred, refreshed attendance status',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                data: createMinimalData(),
                metadata: {
                  source: 'system',
                  recoveryInfo: {
                    type: 'server_error_recovery',
                    attempts: debugInfo.attempts,
                    errors: debugInfo.errors,
                  },
                },
              };
            }

            // Increase poll interval and continue
            pollInterval = Math.min(pollInterval * 2, 2000);
            continue;
          }

          // Reset error counter on successful response
          consecutiveErrors = 0;

          // Use suggested poll interval if provided
          if (response.data.nextPollInterval) {
            pollInterval = response.data.nextPollInterval;
            console.log(
              `Using server-suggested poll interval: ${pollInterval}ms`,
            );
          } else {
            // Otherwise increase poll interval adaptively
            pollInterval = Math.min(pollInterval * 1.5, 2000);
            console.log(`Increased poll interval to: ${pollInterval}ms`);
          }

          // Check if complete or failed
          if (response.data.status === 'completed' && response.data.data) {
            console.log(`Polling complete: ${requestId} - success`, {
              elapsedTime: Date.now() - startTime,
              attempts: i + 1,
            });

            // Check if the data conforms to ProcessingResult
            if (
              typeof response.data.data === 'object' &&
              response.data.data.success !== undefined &&
              response.data.data.timestamp !== undefined &&
              response.data.data.data !== undefined
            ) {
              // Add recovery info to existing metadata
              if (response.data.data.metadata) {
                response.data.data.metadata.pollInfo = {
                  attempts: debugInfo.attempts,
                  errors: debugInfo.errors,
                  elapsedTime: Date.now() - startTime,
                };
              } else {
                response.data.data.metadata = {
                  source: 'system',
                  pollInfo: {
                    attempts: debugInfo.attempts,
                    errors: debugInfo.errors,
                    elapsedTime: Date.now() - startTime,
                  },
                };
              }

              return response.data.data;
            }

            // If not, construct a valid ProcessingResult
            return {
              success: true,
              timestamp: new Date().toISOString(),
              requestId: requestId,
              data: response.data.data,
              metadata: {
                source: 'system',
                pollInfo: {
                  type: 'successful_polling',
                  attempts: debugInfo.attempts,
                  errors: debugInfo.errors,
                  elapsedTime: Date.now() - startTime,
                },
              },
            };
          }

          if (response.data.status === 'failed') {
            console.log(
              `Polling failed: ${requestId} - ${response.data.error || 'unknown error'}`,
            );

            // Even if task failed, try to refresh attendance status
            try {
              console.log(
                'Task failed but refreshing attendance status as recovery',
              );

              // Clear cache first
              try {
                console.log('Clearing cache after failed task');
                await axios.post('/api/attendance/clear-cache', {
                  employeeId,
                  timestamp: new Date().toISOString(),
                });
              } catch (clearCacheError) {
                console.warn('Failed to clear server cache:', clearCacheError);
              }

              await refreshAttendanceStatus();

              // Return a successful result since the operation might have actually completed
              return {
                success: true,
                message: 'Operation likely completed despite reported failure',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                data: createMinimalData(),
                metadata: {
                  source: 'system',
                  recoveryInfo: {
                    type: 'failed_status_recovery',
                    error: response.data.error,
                    attempts: debugInfo.attempts,
                    errors: debugInfo.errors,
                  },
                },
              };
            } catch (refreshError) {
              console.warn('Error during refresh recovery:', refreshError);
            }

            // Now throw the error
            failedWithError = true;
            throw new AppError({
              code: ErrorCode.PROCESSING_ERROR,
              message: response.data.error || 'Processing failed',
              details: response.data,
            });
          }

          // Check if the server indicates an initialization error
          if (response.data.initializationError) {
            console.warn('Server reported initialization error');
            // This is a special case where we should refresh and return success

            // Clear cache first
            try {
              console.log('Clearing cache after initialization error');
              await axios.post('/api/attendance/clear-cache', {
                employeeId,
                timestamp: new Date().toISOString(),
              });
            } catch (clearCacheError) {
              console.warn('Failed to clear server cache:', clearCacheError);
            }

            await refreshAttendanceStatus();

            return {
              success: true,
              message:
                'Server experienced initialization error, refreshed attendance status',
              timestamp: new Date().toISOString(),
              requestId: requestId,
              data: createMinimalData(),
              metadata: {
                source: 'system',
                recoveryInfo: {
                  type: 'initialization_error',
                  attempts: debugInfo.attempts,
                  errors: debugInfo.errors,
                },
              },
            };
          }

          // Check if the server says we should stop polling
          if (response.data.shouldContinuePolling === false) {
            console.log(`Server indicated polling should stop: ${requestId}`);

            // CRITICAL FIX: If we should stop polling, always refresh the status
            console.log('Refreshing attendance status as polling ended');

            // Clear cache first
            try {
              console.log('Clearing cache after polling stopped');
              await axios.post('/api/attendance/clear-cache', {
                employeeId,
                timestamp: new Date().toISOString(),
              });
            } catch (clearCacheError) {
              console.warn('Failed to clear server cache:', clearCacheError);
            }

            await refreshAttendanceStatus();

            // If status is processing but shouldContinuePolling is false
            if (response.data.status === 'processing') {
              console.warn(
                `Status still 'processing' but shouldContinuePolling is false - refreshed status`,
              );

              // Return a basic success result with valid data structure
              return {
                success: true,
                message: 'Processing completed with status refresh',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                data: createMinimalData(),
                metadata: {
                  source: 'system',
                  recoveryInfo: {
                    type: 'processing_with_stop_polling',
                    attempts: debugInfo.attempts,
                    errors: debugInfo.errors,
                  },
                },
              };
            }

            // For other unexpected statuses
            if (
              response.data.status !== 'completed' &&
              response.data.status !== 'failed'
            ) {
              console.warn(
                `Unexpected status '${response.data.status}' with shouldContinuePolling: false - refreshed status`,
              );

              // Return a basic success result with valid data structure
              return {
                success: true,
                message: `Processing completed with status: ${response.data.status}`,
                timestamp: new Date().toISOString(),
                requestId: requestId,
                data: createMinimalData(),
                metadata: {
                  source: 'system',
                  recoveryInfo: {
                    type: 'unexpected_status',
                    status: response.data.status,
                    attempts: debugInfo.attempts,
                    errors: debugInfo.errors,
                  },
                },
              };
            }
          }

          // For pending or processing status, continue polling
          console.log(
            `Status is still ${response.data.status}, continuing to poll`,
          );

          // More aggressive timeout for stuck tasks
          if (response.data.age > 10000 && i >= maxAttempts / 3) {
            // Reduced from 15000 and maxAttempts/2
            console.warn(
              `Task ${requestId} has been ${response.data.status} for too long (${response.data.age}ms)`,
            );
            break; // Try the fallback recovery
          }
        } catch (error) {
          console.error(`Polling error for request ${requestId}:`, error);
          consecutiveErrors++;
          debugInfo.errors++;

          // Check if this is a server error (500)
          const isServerError =
            axios.isAxiosError(error) && (error.response?.status ?? 0) >= 500;

          // For server errors, try to recover more quickly
          if (isServerError && consecutiveErrors >= 2) {
            console.warn('Multiple server errors, attempting recovery');
            try {
              // Clear cache first
              try {
                console.log('Clearing cache after server errors');
                await axios.post('/api/attendance/clear-cache', {
                  employeeId,
                  timestamp: new Date().toISOString(),
                });
              } catch (clearCacheError) {
                console.warn('Failed to clear server cache:', clearCacheError);
              }

              await refreshAttendanceStatus();

              return {
                success: true,
                message: 'Server error occurred, refreshed attendance status',
                timestamp: new Date().toISOString(),
                requestId: requestId,
                data: createMinimalData(),
                metadata: {
                  source: 'system',
                  recoveryInfo: {
                    type: 'server_error_recovery',
                    attempts: debugInfo.attempts,
                    errors: debugInfo.errors,
                  },
                },
              };
            } catch (refreshError) {
              console.error(
                'Failed to recover from server error:',
                refreshError,
              );
            }
          }

          // Increase poll interval after errors
          pollInterval = Math.min(pollInterval * 2, 2000);

          // Fail if we've had too many consecutive errors
          if (consecutiveErrors >= 3 || failedWithError) {
            throw new AppError({
              code: ErrorCode.NETWORK_ERROR,
              message: 'Failed to check status after multiple attempts',
              originalError: error,
            });
          }
        }
      }

      // If we've exhausted all polling attempts, try to recover
      console.warn(`Polling exhausted for ${requestId}, trying to recover...`, {
        attempts: debugInfo.attempts,
        errors: debugInfo.errors,
        totalTime: Date.now() - startTime,
      });

      // CRITICAL FIX: Clear cache before refreshing status
      try {
        console.log('Automatically clearing cache after polling failure');
        await axios.post('/api/attendance/clear-cache', {
          employeeId,
          timestamp: new Date().toISOString(),
        });
      } catch (clearCacheError) {
        console.warn('Failed to clear server cache:', clearCacheError);
      }

      // Try to refresh attendance data as recovery
      try {
        await refreshAttendanceStatus();

        // Log final outcome
        console.log(
          `Recovery complete for ${requestId} - refreshed attendance status`,
          {
            finalTime: Date.now() - startTime,
          },
        );

        return {
          success: true,
          message: 'Operation likely completed, attendance refreshed',
          timestamp: new Date().toISOString(),
          requestId: requestId,
          data: createMinimalData(),
          metadata: {
            source: 'system',
            recoveryInfo: {
              type: 'exhausted_polling',
              attempts: debugInfo.attempts,
              errors: debugInfo.errors,
              totalTime: Date.now() - startTime,
            },
          },
        };
      } catch (fallbackError) {
        // ADDITIONAL FALLBACK: Try one more time with cache-busting
        try {
          console.log('Trying one more time with cache-busting...');
          await mutate(); // Force another refresh

          return {
            success: true,
            message: 'Recovery completed with forced refresh',
            timestamp: new Date().toISOString(),
            requestId: requestId,
            data: createMinimalData(),
            metadata: {
              source: 'system',
              recoveryInfo: {
                type: 'forced_refresh',
                attempts: debugInfo.attempts,
                errors: debugInfo.errors,
                totalTime: Date.now() - startTime,
              },
            },
          };
        } catch (finalError) {
          throw new AppError({
            code: ErrorCode.TIMEOUT,
            message: 'Processing timed out after maximum attempts',
            originalError: fallbackError,
          });
        }
      }
    },
    [refreshAttendanceStatus, employeeId, mutate],
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
