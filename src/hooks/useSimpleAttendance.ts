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
  useEffect(() => {
    console.log('useSimpleAttendance initialized with:', {
      employeeId,
      lineUserId,
      hasInitialStatus: !!initialAttendanceStatus,
      enabled,
    });
  }, [employeeId, lineUserId, initialAttendanceStatus, enabled]);

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

  useEffect(() => {
    if (data) {
      console.log('useAttendanceData raw response:', {
        base: {
          state: data.base.state,
          checkStatus: data.base.checkStatus,
          isCheckingIn: data.base.isCheckingIn,
          latestAttendance: data.base.latestAttendance,
        },
        window: {
          type: data.window.type,
          current: data.window.current,
          shift: data.window.shift,
        },
        validation: data.validation,
      });
    }
  }, [data]);

  useEffect(() => {
    console.log('Overtime context update:', {
      hasOvertimeInfo: !!data?.window?.overtimeInfo,
      overtimeContext,
    });
  }, [data?.window?.overtimeInfo, overtimeContext]);

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

  useEffect(() => {
    if (data) {
      console.log('Current period calculation:', {
        input: {
          windowType: data.window.type,
          windowCurrent: data.window.current,
          latestAttendance: data.base.latestAttendance,
          overtimeInfo: data.window.overtimeInfo,
        },
        output: currentPeriod,
        derivedValues: {
          isComplete: Boolean(data.base.latestAttendance?.regularCheckOutTime),
          isCheckingIn: !data.base.latestAttendance?.regularCheckInTime,
          checkInTime: data.base.latestAttendance?.regularCheckInTime,
          checkOutTime: data.base.latestAttendance?.regularCheckOutTime,
        },
      });
    }
  }, [data, currentPeriod]);

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

  // Log final return values
  const returnValues = {
    state: data?.base.state || AttendanceState.ABSENT,
    checkStatus: data?.base.checkStatus || CheckStatus.PENDING,
    isCheckingIn: data?.base.isCheckingIn ?? true,
    effectiveShift: data?.window?.shift || null,
    isDayOff: data?.window?.isDayOff || false, // Add this
    isHoliday: data?.window?.isHoliday || false,
    currentPeriod,
    validation: data?.validation || null,
    isLoading: isInitializing || locationLoading || isAttendanceLoading,
  };

  useEffect(() => {
    console.log('useSimpleAttendance return values:', returnValues);
  }, [returnValues]);

  return {
    ...returnValues,
    overtimeContext,
    locationReady,
    locationState,
    error: attendanceError?.message || locationError,
    isLocationLoading: locationLoading,
    checkInOut,
    refreshAttendanceStatus: enhancedRefreshStatus,
    getCurrentLocation,
  };
}
