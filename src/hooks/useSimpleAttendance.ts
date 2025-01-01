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

  // Base state handling
  const baseState: AttendanceBaseResponse = useMemo(() => {
    if (rawData?.base) {
      console.log('Using provided base state:', rawData.base);
      return rawData.base;
    }

    console.log('Using default base state');
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
  }, [rawData?.base]);

  // Period state processing
  const periodState = useMemo((): UnifiedPeriodState => {
    if (rawData?.daily?.currentState) {
      console.log('Using provided period state:', rawData.daily.currentState);
      return rawData.daily.currentState;
    }

    if (rawData?.context?.shift) {
      const now = getCurrentTime();
      console.log(
        'Constructing period state from shift context:',
        rawData.context.shift,
      );
      return {
        type: PeriodType.REGULAR,
        timeWindow: {
          start: format(
            now,
            `yyyy-MM-dd'T'${rawData.context.shift.startTime}:00.000`,
          ),
          end: format(
            now,
            `yyyy-MM-dd'T'${rawData.context.shift.endTime}:00.000`,
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

    if (initialAttendanceStatus?.daily?.currentState) {
      console.log('Using initial period state');
      return initialAttendanceStatus.daily.currentState;
    }

    console.log('Using default period state');
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
    rawData?.daily?.currentState,
    rawData?.context?.shift,
    initialAttendanceStatus,
  ]);

  // Context processing
  const context = useMemo(() => {
    if (!rawData?.context) {
      console.log('No context available, using initial status');
      if (!initialAttendanceStatus?.context) {
        console.error('No context found in either raw data or initial status');
        // Since context is required, we return initial context to prevent app crash
        // but log an error for debugging
        return {
          shift: initialAttendanceStatus?.context?.shift || {
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
      }
      return initialAttendanceStatus.context;
    }

    console.log('Using provided context:', rawData.context);
    return rawData.context;
  }, [rawData?.context, initialAttendanceStatus]);

  // State validation with all required flags
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

  // Transitions handling
  const transitions = useMemo(() => {
    const currentTransitions = rawData?.daily?.transitions || [];
    console.log('Current transitions:', currentTransitions);
    return currentTransitions;
  }, [rawData?.daily?.transitions]);

  const hasPendingTransition = useMemo(() => {
    const hasTransition = transitions.length > 0;
    console.log('Pending transition:', hasTransition);
    return hasTransition;
  }, [transitions]);

  const nextTransition = useMemo(() => {
    return transitions[0] || null;
  }, [transitions]);

  useEffect(() => {
    if (rawData && isInitializing) {
      console.log('Initialization complete');
      setIsInitializing(false);
    }
  }, [rawData, isInitializing]);

  return {
    state: rawData?.base?.state || AttendanceState.ABSENT,
    checkStatus: rawData?.base?.checkStatus || CheckStatus.PENDING,
    isCheckingIn: rawData?.base?.isCheckingIn ?? true,
    base: baseState,

    periodState,
    stateValidation: rawData?.validation || defaultStateValidation,

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
