import {
  UseSimpleAttendanceProps,
  UseSimpleAttendanceReturn,
  AttendanceStateResponse,
  AttendanceState,
  CheckStatus,
  CurrentPeriodInfo,
} from '@/types/attendance';
import { useEnhancedLocation } from './useEnhancedLocation';
import { useAttendanceData } from './useAttendanceData';
import { KeyedMutator } from 'swr';

export function useSimpleAttendance({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
  enabled = true,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn {
  const { locationState, locationReady, locationError, getCurrentLocation } =
    useEnhancedLocation();

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
    enabled,
  });

  const enhancedRefreshStatus = Object.assign(refreshAttendanceStatus, {
    mutate: mutate as KeyedMutator<AttendanceStateResponse>,
  });

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

  return {
    state: data?.base.state || AttendanceState.ABSENT,
    checkStatus: data?.base.checkStatus || CheckStatus.PENDING,
    isCheckingIn: data?.base.isCheckingIn ?? true,
    effectiveShift: data?.window?.shift || null,
    currentPeriod,
    validation: data?.validation || null,
    isLoading: !locationReady || isAttendanceLoading,
    isLocationLoading: !locationReady,
    error: attendanceError?.message || locationError,
    locationReady,
    locationState,
    checkInOut,
    refreshAttendanceStatus: enhancedRefreshStatus,
    getCurrentLocation,
  };
}
