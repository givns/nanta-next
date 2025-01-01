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

  // Base state
  const baseState: AttendanceBaseResponse = useMemo(() => {
    if (rawData?.base) {
      return rawData.base;
    }

    if (initialAttendanceStatus?.base) {
      return initialAttendanceStatus.base;
    }

    return {
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
  }, [rawData?.base, initialAttendanceStatus]);

  // Period state
  const periodState = useMemo((): UnifiedPeriodState => {
    if (rawData?.daily?.currentState) {
      return rawData.daily.currentState;
    }

    if (initialAttendanceStatus?.daily?.currentState) {
      return initialAttendanceStatus.daily.currentState;
    }

    const now = getCurrentTime();
    return {
      type: PeriodType.REGULAR,
      timeWindow: {
        start: format(now, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(addHours(now, 8), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
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
  }, [rawData?.daily?.currentState, initialAttendanceStatus]);

  // Context handling
  const context = useMemo(() => {
    if (rawData?.context) {
      return rawData.context;
    }

    if (initialAttendanceStatus?.context) {
      return initialAttendanceStatus.context;
    }

    // Only as a last resort - should log error if this happens
    console.error('No context available in either raw data or initial status');
    return {
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
  }, [rawData?.context, initialAttendanceStatus]);

  // Transitions
  const transitions = useMemo(() => {
    return rawData?.daily?.transitions || [];
  }, [rawData?.daily?.transitions]);

  const hasPendingTransition = useMemo(() => {
    return (
      transitions.length > 0 ||
      Boolean(context.transition?.isInTransition) ||
      Boolean(rawData?.validation?.flags.hasPendingTransition)
    );
  }, [
    transitions,
    context.transition,
    rawData?.validation?.flags.hasPendingTransition,
  ]);

  // Default state validation with all required flags
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
  };

  // Initialize state
  useEffect(() => {
    if (rawData && isInitializing) {
      setIsInitializing(false);
    }
  }, [rawData, isInitializing]);

  return {
    // Base states
    state: rawData?.base?.state || AttendanceState.ABSENT,
    checkStatus: rawData?.base?.checkStatus || CheckStatus.PENDING,
    isCheckingIn: rawData?.base?.isCheckingIn ?? true,
    base: baseState,

    // Period and validation states
    periodState,
    stateValidation: rawData?.validation || defaultStateValidation,

    // Context and transitions
    context,
    transitions,
    hasPendingTransition,
    nextTransition: transitions[0] || null,

    // Schedule info
    isDayOff: context.schedule.isDayOff,
    isHoliday: context.schedule.isHoliday,
    isAdjusted: context.schedule.isAdjusted,
    holidayInfo: context.schedule.holidayInfo,

    // Period transitions
    nextPeriod: context.nextPeriod,
    transition: context.transition,

    // Shift info
    shift: context.shift,

    // Loading and error states
    isLoading: isInitializing || locationLoading || isAttendanceLoading,
    isLocationLoading: locationLoading,
    error: attendanceError?.message || locationError,

    // Location state
    locationReady,
    locationState,

    // Actions
    checkInOut,
    refreshAttendanceStatus,
    getCurrentLocation,
  };
}
