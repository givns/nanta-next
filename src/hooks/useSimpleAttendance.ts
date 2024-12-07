// hooks/useSimpleAttendance.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import { useAttendanceData } from './useAttendanceData';
import { KeyedMutator } from 'swr';
import {
  AttendanceState,
  AttendanceStateResponse,
  CheckStatus,
  CurrentPeriodInfo,
  LocationState,
  UseSimpleAttendanceReturn,
  ValidationResult,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { OvertimeContext } from '@/types/attendance/overtime';

interface UseSimpleAttendanceProps {
  employeeId?: string;
  lineUserId?: string;
  initialAttendanceStatus?: AttendanceStateResponse;
  enabled?: boolean;
}

export function useSimpleAttendance({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
  enabled = true,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn {
  const [isInitializing, setIsInitializing] = useState(true);
  const [overtimeContext, setOvertimeContext] =
    useState<OvertimeContext | null>(null);

  const {
    locationState,
    locationReady,
    locationError,
    getCurrentLocation,
    isLoading: locationLoading,
  } = useEnhancedLocation();

  const {
    data,
    error: attendanceError,
    isLoading: isAttendanceLoading,
    refreshAttendanceStatus,
    checkInOut,
    mutate,
  } = useAttendanceData({
    employeeId,
    lineUserId: lineUserId ?? undefined,
    locationState,
    initialAttendanceStatus,
    enabled: enabled && locationReady,
  });

  // Initialize overtime context when data changes
  useEffect(() => {
    if (data?.window?.overtimeInfo) {
      setOvertimeContext({
        id: data.window.overtimeInfo.id,
        startTime: data.window.overtimeInfo.startTime,
        endTime: data.window.overtimeInfo.endTime,
        durationMinutes: data.window.overtimeInfo.durationMinutes,
        isInsideShiftHours: data.window.overtimeInfo.isInsideShiftHours,
        isDayOffOvertime: data.window.overtimeInfo.isDayOffOvertime,
        reason: data.window.overtimeInfo.reason,
      });
    } else {
      setOvertimeContext(null);
    }
  }, [data?.window?.overtimeInfo]);

  // Clear initializing state once data is loaded
  useEffect(() => {
    if (data && isInitializing) {
      setIsInitializing(false);
    }
  }, [data, isInitializing]);

  useEffect(() => {
    if (data) {
      console.log('Attendance Data from API:', {
        base: data.base,
        window: data.window,
        validation: data.validation,
      });
    }
  }, [data]);

  // Create current period info from window data
  const currentPeriod: CurrentPeriodInfo | null = data?.window
    ? {
        type: data.window.type,
        current: data.window.current,
        isComplete: Boolean(data.base.latestAttendance?.regularCheckOutTime),
        checkInTime: data.base.latestAttendance?.regularCheckInTime ?? null,
        checkOutTime: data.base.latestAttendance?.regularCheckOutTime ?? null,
        overtimeId: data.window.overtimeInfo?.id,
      }
    : null;

  console.log('Current Period:', {
    currentPeriod,
    checkInTime: currentPeriod?.checkInTime,
    checkOutTime: currentPeriod?.checkOutTime,
    isCheckingIn: !currentPeriod?.checkInTime,
    latestAttendance: data?.base?.latestAttendance,
    baseIsCheckingIn: data?.base?.isCheckingIn,
  });

  // In useSimpleAttendance.ts
  const enhancedRefreshStatus = useMemo(() => {
    const refresh = async (options?: {
      forceRefresh?: boolean;
      throwOnError?: boolean;
    }) => {
      try {
        await refreshAttendanceStatus(options);
        // Force a re-fetch of the latest data
        await mutate(undefined, { revalidate: true });
      } catch (error) {
        console.error('Error refreshing status:', error);
        throw error;
      }
    };

    // Attach mutate property to maintain type compatibility
    return Object.assign(refresh, {
      mutate: mutate as KeyedMutator<AttendanceStateResponse>,
    });
  }, [refreshAttendanceStatus, mutate]);

  return {
    // Basic state
    state: data?.base.state || AttendanceState.ABSENT,
    checkStatus: data?.base.checkStatus || CheckStatus.PENDING,
    isCheckingIn: data?.base.isCheckingIn ?? true,

    // Period and shift info
    effectiveShift: data?.window?.shift || null,
    currentPeriod,

    // Overtime context
    overtimeContext,

    // Validation and status
    validation: data?.validation || null,

    // Loading and error states
    isLoading: isInitializing || locationLoading || isAttendanceLoading,
    isLocationLoading: locationLoading,
    error: attendanceError?.message || locationError,

    // Location info
    locationReady,
    locationState,

    // Actions
    checkInOut,
    refreshAttendanceStatus: enhancedRefreshStatus,
    getCurrentLocation,
  };
}
