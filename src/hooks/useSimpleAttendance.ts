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
    data: rawData,
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

  const defaultShift = {
    id: '',
    shiftCode: '',
    name: '',
    startTime: '08:00',
    endTime: '17:00',
    workDays: [],
  };

  const defaultContext: ShiftContext & TransitionContext = {
    shift: defaultShift,
    schedule: {
      isHoliday: false,
      isDayOff: false,
      isAdjusted: false,
    },
    nextPeriod: null,
    transition: undefined,
  };

  const defaultTimeWindow = {
    start: now.toISOString(),
    end: format(addHours(now, 8), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
  };

  const defaultPeriodState: UnifiedPeriodState = {
    type: PeriodType.REGULAR,
    timeWindow: defaultTimeWindow,
    activity: {
      isActive: false,
      checkIn: null,
      checkOut: null,
      isOvertime: false,
      isDayOffOvertime: false,
      isInsideShiftHours: false,
    },
    validation: {
      isWithinBounds: false,
      isEarly: false,
      isLate: false,
      isOvernight: false,
      isConnected: false,
    },
  };

  const data = useMemo(() => {
    if (!rawData) return null;

    console.log('Raw attendance data:', {
      shift: rawData.context?.shift,
      timeWindow: rawData.daily?.currentState?.timeWindow,
      hasContext: Boolean(rawData.context),
      hasDaily: Boolean(rawData.daily),
    });

    // Validate shift data structure exists
    if (!rawData.context) {
      console.warn('No context in raw data, using defaults');
      return {
        ...rawData,
        context: defaultContext,
      };
    }

    // Check for valid shift data
    const hasValidShift = Boolean(
      rawData.context.shift?.id &&
        rawData.context.shift?.startTime &&
        rawData.context.shift?.endTime &&
        rawData.context.shift?.shiftCode,
    );

    if (!hasValidShift) {
      console.warn('Invalid shift data, using defaults:', {
        receivedShift: rawData.context.shift,
        hasShift: Boolean(rawData.context.shift),
        shiftDetails: {
          id: rawData.context.shift?.id,
          startTime: rawData.context.shift?.startTime,
          endTime: rawData.context.shift?.endTime,
          shiftCode: rawData.context.shift?.shiftCode,
        },
      });
      return {
        ...rawData,
        context: {
          ...rawData.context,
          shift: defaultShift,
        },
      };
    }

    // Keep original data if all validations pass
    return rawData;
  }, [rawData]);

  const periodState = useMemo((): UnifiedPeriodState => {
    if (!data?.daily?.currentState) {
      console.warn('No current state available, using default period state');
      return defaultPeriodState;
    }

    const currentState = data.daily.currentState;
    const timeWindow = currentState.timeWindow;

    // Log time window validation
    console.log('Time window validation:', {
      hasTimeWindow: Boolean(timeWindow),
      start: timeWindow?.start,
      end: timeWindow?.end,
      isValid: Boolean(timeWindow?.start && timeWindow?.end),
    });

    if (!timeWindow || !timeWindow.start || !timeWindow.end) {
      return {
        ...defaultPeriodState,
        timeWindow: {
          start: format(now, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          end: format(addHours(now, 8), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        },
      };
    }

    return currentState;
  }, [data?.daily?.currentState, now]);

  const context = useMemo((): ShiftContext & TransitionContext => {
    console.log('Context processing:', {
      hasData: Boolean(data),
      hasContext: Boolean(data?.context),
      rawShift: data?.context?.shift,
    });

    if (!data?.context) {
      return defaultContext;
    }

    const ctx = data.context;
    const isValidShift = Boolean(
      ctx.shift?.id &&
        ctx.shift?.startTime &&
        ctx.shift?.endTime &&
        ctx.shift?.shiftCode,
    );

    if (!isValidShift) {
      return {
        ...defaultContext,
        schedule: ctx.schedule || defaultContext.schedule,
      };
    }

    return ctx;
  }, [data?.context]);

  useEffect(() => {
    if (data) {
      const timeWindow = data.daily?.currentState?.timeWindow;
      const shift = data.context?.shift;

      if (timeWindow && (!timeWindow.start || !timeWindow.end)) {
        console.warn('Invalid time window detected:', timeWindow);
      }

      if (shift && (!shift.startTime || !shift.endTime)) {
        console.warn('Invalid shift times detected:', shift);
      }
    }
  }, [data]);

  useEffect(() => {
    if (data && isInitializing) {
      setIsInitializing(false);
    }
  }, [data, isInitializing]);

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
    state: data?.base?.state || AttendanceState.ABSENT,
    checkStatus: data?.base?.checkStatus || CheckStatus.PENDING,
    isCheckingIn: data?.base?.isCheckingIn ?? true,
    base: data?.base || defaultBaseState,

    periodState,
    stateValidation: data?.validation || defaultStateValidation,

    context,
    transitions,
    hasPendingTransition,
    nextTransition,

    isDayOff: context.schedule.isDayOff,
    isHoliday: context.schedule.isHoliday,
    isAdjusted: context.schedule.isAdjusted,
    holidayInfo: context.schedule.holidayInfo,

    nextPeriod: context.nextPeriod,
    transition: context.transition,

    shift: context.shift,

    isLoading: isInitializing || locationLoading || isAttendanceLoading,
    isLocationLoading: locationLoading,
    error: attendanceError?.message || locationError || undefined,

    locationReady,
    locationState,

    checkInOut,
    refreshAttendanceStatus,
    getCurrentLocation,
  };
}
