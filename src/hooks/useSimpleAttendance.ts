import { useEffect, useMemo, useState } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import { useAttendanceData } from './useAttendanceData';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  UseSimpleAttendanceProps,
  UseSimpleAttendanceReturn,
  AttendanceBaseResponse,
  UnifiedPeriodState,
  StateValidation,
  ShiftContext,
  TransitionContext,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';

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
    initialAttendanceStatus,
    enabled: enabled && locationReady,
  });

  // Initialize default states
  const defaultBaseState: AttendanceBaseResponse = {
    state: AttendanceState.ABSENT,
    checkStatus: CheckStatus.PENDING,
    isCheckingIn: true,
    latestAttendance: null,
    periodInfo: {
      type: PeriodType.REGULAR,
      isOvertime: false,
    },
    validation: {
      canCheckIn: false,
      canCheckOut: false,
      message: '',
    },
    metadata: {
      lastUpdated: getCurrentTime().toISOString(),
      version: 1,
      source: 'system',
    },
  };

  const defaultStateValidation: StateValidation = {
    allowed: false,
    reason: '',
    flags: {
      hasActivePeriod: false,
      isInsideShift: false,
      isOutsideShift: false,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isEarlyCheckOut: false,
      isLateCheckOut: false,
      isVeryLateCheckOut: false,
      isOvertime: false,
      isPendingOvertime: false,
      isDayOffOvertime: false,
      isAutoCheckIn: false,
      isAutoCheckOut: false,
      requiresAutoCompletion: false,
      hasPendingTransition: false,
      requiresTransition: false,
      isAfternoonShift: false,
      isMorningShift: false,
      isAfterMidshift: false,
      isApprovedEarlyCheckout: false,
      isPlannedHalfDayLeave: false,
      isEmergencyLeave: false,
      isHoliday: false,
      isDayOff: false,
      isManualEntry: false,
    },
    metadata: {
      nextTransitionTime: undefined,
      requiredAction: undefined,
      additionalInfo: undefined,
    },
  };

  const defaultPeriodState: UnifiedPeriodState = {
    type: PeriodType.REGULAR,
    timeWindow: {
      start: '',
      end: '',
    },
    activity: {
      isActive: false,
      checkIn: null,
      checkOut: null,
      isOvertime: false,
      isDayOffOvertime: false,
    },
    validation: {
      isWithinBounds: false,
      isEarly: false,
      isLate: false,
      isOvernight: false,
      isConnected: false,
    },
  };

  const defaultContext: ShiftContext & TransitionContext = {
    shift: {
      id: '',
      shiftCode: '',
      name: '',
      startTime: '',
      endTime: '',
      workDays: [],
    },
    schedule: {
      isHoliday: false,
      isDayOff: false,
      isAdjusted: false,
    },
    nextPeriod: null,
    transition: undefined,
  };

  useEffect(() => {
    if (data && isInitializing) {
      setIsInitializing(false);
    }
  }, [data, isInitializing]);

  // Map attendance status response to proper types
  const periodState = useMemo((): UnifiedPeriodState => {
    if (!data?.daily?.currentState) return defaultPeriodState;
    return data.daily.currentState;
  }, [data?.daily?.currentState]);

  const context = useMemo((): ShiftContext & TransitionContext => {
    if (!data?.context) return defaultContext;
    return data.context;
  }, [data?.context]);

  // Calculate derived states
  const transitions = useMemo(() => {
    return data?.daily?.transitions || [];
  }, [data?.daily?.transitions]);

  const hasPendingTransition = useMemo(() => {
    return transitions.length > 0;
  }, [transitions]);

  const nextTransition = useMemo(() => {
    return transitions[0] || null;
  }, [transitions]);

  return {
    // Core attendance states
    state: data?.base?.state || AttendanceState.ABSENT,
    checkStatus: data?.base?.checkStatus || CheckStatus.PENDING,
    isCheckingIn: data?.base?.isCheckingIn ?? true,
    base: data?.base || defaultBaseState,

    // Period and validation states
    periodState,
    stateValidation: data?.validation || defaultStateValidation,

    // Context information
    context,
    transitions,
    hasPendingTransition,
    nextTransition,

    // Schedule status
    isDayOff: context.schedule.isDayOff,
    isHoliday: context.schedule.isHoliday,
    isAdjusted: context.schedule.isAdjusted,
    holidayInfo: context.schedule.holidayInfo,

    // Transition information
    nextPeriod: context.nextPeriod,
    transition: context.transition,

    // Shift information
    shift: context.shift,

    // Loading and error states
    isLoading: isInitializing || locationLoading || isAttendanceLoading,
    isLocationLoading: locationLoading,
    error: attendanceError?.message || locationError || undefined,

    // Location information
    locationReady,
    locationState,

    // Actions
    checkInOut,
    refreshAttendanceStatus,
    getCurrentLocation,
  };
}
