// hooks/useSimpleAttendance.ts
import { useCallback, useEffect, useState } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import { useAttendanceData } from './useAttendanceData';
import { KeyedMutator } from 'swr';
import {
  UseSimpleAttendanceProps,
  UseSimpleAttendanceReturn,
  AttendanceStateResponse,
  AttendanceState,
  CheckStatus,
  CurrentPeriodInfo,
} from '@/types/attendance';

export function useSimpleAttendance({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
  enabled = true,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn {
  const [isInitializing, setIsInitializing] = useState(true);
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
    initialAttendanceStatus: initialAttendanceStatus ?? undefined,
    enabled: enabled && locationReady,
  });

  useEffect(() => {
    if (data && isInitializing) {
      setIsInitializing(false);
    }
  }, [data, isInitializing]);

  // Create current period info from window data
  const currentPeriod: CurrentPeriodInfo | null = data?.window
    ? {
        type: data.window.type,
        current: data.window.current,
        isComplete: Boolean(data.base.latestAttendance?.regularCheckOutTime),
        checkInTime: data.base.latestAttendance?.regularCheckInTime || null,
        checkOutTime: data.base.latestAttendance?.regularCheckOutTime || null,
        overtimeId: data.window.overtimeInfo?.id,
      }
    : null;

  const enhancedRefreshStatus = Object.assign(refreshAttendanceStatus, {
    mutate: mutate as KeyedMutator<AttendanceStateResponse>,
  });

  return {
    state: data?.base.state || AttendanceState.ABSENT,
    checkStatus: data?.base.checkStatus || CheckStatus.PENDING,
    isCheckingIn: data?.base.isCheckingIn ?? true,
    effectiveShift: data?.window?.shift || null,
    currentPeriod,
    validation: data?.validation || null,
    isLoading: isInitializing || locationLoading || isAttendanceLoading,
    isLocationLoading: locationLoading,
    error: attendanceError?.message || locationError,
    locationReady,
    locationState,
    checkInOut,
    refreshAttendanceStatus: enhancedRefreshStatus,
    getCurrentLocation,
  };
}
