import { useEffect, useMemo, useState } from 'react';
import { useEnhancedLocation } from './useEnhancedLocation';
import { useAttendanceData } from './useAttendanceData';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  UseSimpleAttendanceProps,
  UseSimpleAttendanceReturn,
  AttendanceBaseResponse,
  UnifiedPeriodState,
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

  // Initialize states for absent/no data scenario
  const baseState: AttendanceBaseResponse = {
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

  // Process raw data
  const data = useMemo(() => {
    if (!rawData) {
      console.log('No raw data available');
      return null;
    }

    console.log('Raw attendance data:', {
      shift: rawData.context?.shift,
      timeWindow: rawData.daily?.currentState?.timeWindow,
      hasContext: Boolean(rawData.context),
      hasDaily: Boolean(rawData.daily),
    });

    // Preserve raw data without modification
    return rawData;
  }, [rawData]);

  // Get period state - ensure we always return a UnifiedPeriodState
  const periodState = useMemo((): UnifiedPeriodState => {
    // If we have valid period state, use it
    if (data?.daily?.currentState) {
      return data.daily.currentState;
    }

    // If we have shift data, construct a period state from it
    if (data?.context?.shift) {
      return {
        type: PeriodType.REGULAR,
        timeWindow: {
          start: format(
            getCurrentTime(),
            `yyyy-MM-dd'T'${data.context.shift.startTime}:00.000`,
          ),
          end: format(
            getCurrentTime(),
            `yyyy-MM-dd'T'${data.context.shift.endTime}:00.000`,
          ),
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
    }

    // If we have initial state, use it
    if (initialAttendanceStatus?.daily?.currentState) {
      return initialAttendanceStatus.daily.currentState;
    }

    // Final fallback - empty period state
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
  }, [
    data?.daily?.currentState,
    data?.context?.shift,
    initialAttendanceStatus,
  ]);

  // Get context - preserve original shift data
  const context = useMemo(() => {
    if (!data?.context) {
      console.log('No context available');
      return (
        initialAttendanceStatus?.context || {
          shift: initialAttendanceStatus?.context?.shift || {
            id: '',
            shiftCode: '',
            name: '',
            startTime: '08:00',
            endTime: '17:00',
            workDays: [],
          },
          schedule: {
            isHoliday: false,
            isDayOff: false,
            isAdjusted: false,
          },
          nextPeriod: null,
          transition: undefined,
        }
      );
    }
    // Keep original context
    return data.context;
  }, [data?.context, initialAttendanceStatus]);

  // Get state validation
  const stateValidation = useMemo(() => {
    if (!data?.validation) {
      return (
        initialAttendanceStatus?.validation || {
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
        }
      );
    }
    return data.validation;
  }, [data?.validation, initialAttendanceStatus]);

  useEffect(() => {
    if (data && isInitializing) {
      setIsInitializing(false);
    }
  }, [data, isInitializing]);

  const transitions = useMemo(
    () => data?.daily?.transitions || [],
    [data?.daily?.transitions],
  );
  const hasPendingTransition = useMemo(
    () => transitions.length > 0,
    [transitions],
  );
  const nextTransition = useMemo(() => transitions[0] || null, [transitions]);

  return {
    state: data?.base?.state || AttendanceState.ABSENT,
    checkStatus: data?.base?.checkStatus || CheckStatus.PENDING,
    isCheckingIn: data?.base?.isCheckingIn ?? true,
    base: data?.base || baseState,

    periodState,
    stateValidation,

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
    error: attendanceError?.message || locationError,

    locationReady,
    locationState,

    checkInOut,
    refreshAttendanceStatus,
    getCurrentLocation,
  };
}
