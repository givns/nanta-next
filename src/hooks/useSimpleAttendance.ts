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
import { format, addHours } from 'date-fns';

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

  function isValidDate(d: Date): boolean {
    return d instanceof Date && !isNaN(d.getTime());
  }

  const now = getCurrentTime();
  if (!isValidDate(now)) {
    console.error('Invalid date generated');
  }

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
      lastUpdated: isValidDate(getCurrentTime())
        ? getCurrentTime().toISOString()
        : new Date().toISOString(),
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

  // 1. Add helper for default time window
  const getDefaultTimeWindow = () => {
    const now = getCurrentTime();
    return {
      start: now.toISOString(),
      end: new Date(now.setHours(now.getHours() + 8)).toISOString(), // Default 8-hour window
    };
  };

  // 2. Update defaultPeriodState
  const defaultPeriodState: UnifiedPeriodState = {
    type: PeriodType.REGULAR,
    timeWindow: getDefaultTimeWindow(), // Use proper time window instead of empty strings
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

  // 3. Update defaultContext with proper time values
  const defaultContext: ShiftContext & TransitionContext = {
    shift: {
      id: '',
      shiftCode: '',
      name: '',
      startTime: format(getCurrentTime(), 'HH:mm'), // Use current hour/minute
      endTime: format(addHours(getCurrentTime(), 8), 'HH:mm'), // Default 8 hours later
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

  // 4. Add validation for incoming data
  const periodState = useMemo((): UnifiedPeriodState => {
    if (!data?.daily?.currentState) return defaultPeriodState;

    const currentState = data.daily.currentState;
    // Validate time window
    if (!currentState.timeWindow.start || !currentState.timeWindow.end) {
      return {
        ...currentState,
        timeWindow: getDefaultTimeWindow(),
      };
    }
    return currentState;
  }, [data?.daily?.currentState]);

  const context = useMemo((): ShiftContext & TransitionContext => {
    if (!data?.context) return defaultContext;

    const ctx = data.context;
    // Validate shift times
    if (!ctx.shift.startTime || !ctx.shift.endTime) {
      return {
        ...ctx,
        shift: {
          ...ctx.shift,
          startTime: format(getCurrentTime(), 'HH:mm'),
          endTime: format(addHours(getCurrentTime(), 8), 'HH:mm'),
        },
      };
    }
    return ctx;
  }, [data?.context]);

  // 5. Add date validation check
  useEffect(() => {
    if (data) {
      // Validate all date/time fields
      const timeWindow = data.daily?.currentState?.timeWindow;
      const shift = data.context?.shift;

      if (timeWindow && (!timeWindow.start || !timeWindow.end)) {
        console.warn('Invalid time window in data:', timeWindow);
      }

      if (shift && (!shift.startTime || !shift.endTime)) {
        console.warn('Invalid shift times in data:', shift);
      }
    }
  }, [data]);

  useEffect(() => {
    if (data && isInitializing) {
      setIsInitializing(false);
    }
  }, [data, isInitializing]);

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
