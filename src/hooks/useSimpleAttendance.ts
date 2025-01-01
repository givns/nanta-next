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
  const [isDataReady, setIsDataReady] = useState(false);

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

  // Check if data is ready
  useEffect(() => {
    if (rawData && !isDataReady) {
      console.log('Raw attendance data received:', rawData);
      setIsDataReady(true);
    }
  }, [rawData, isDataReady]);

  useEffect(() => {
    if (isDataReady && isInitializing) {
      setIsInitializing(false);
    }
  }, [isDataReady, isInitializing]);

  // Base state
  const baseState = useMemo((): AttendanceBaseResponse => {
    if (rawData?.base) {
      return rawData.base;
    }

    // Return default base state
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

  // Period state
  const periodState = useMemo((): UnifiedPeriodState => {
    if (rawData?.daily?.currentState) {
      return rawData.daily.currentState;
    }

    // Return default period state
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
  }, [rawData?.daily?.currentState]);

  // Default state validation
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

  // Context and transition states
  const context = useMemo(() => {
    return rawData?.context;
  }, [rawData?.context]);

  const transitions = useMemo(() => {
    return rawData?.daily?.transitions || [];
  }, [rawData?.daily?.transitions]);

  const hasPendingTransition = useMemo(() => {
    return Boolean(
      transitions.length > 0 ||
        context?.transition?.isInTransition ||
        rawData?.validation?.flags.hasPendingTransition,
    );
  }, [
    transitions,
    context?.transition,
    rawData?.validation?.flags.hasPendingTransition,
  ]);

  // Compute loading state
  const isLoading =
    isInitializing || locationLoading || isAttendanceLoading || !isDataReady;

  // Only return complete data when ready
  if (!isDataReady || !context) {
    return {
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      isCheckingIn: true,
      base: baseState,
      periodState,
      stateValidation: defaultStateValidation,
      context: {
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
      },
      transitions: [],
      hasPendingTransition: false,
      nextTransition: null,
      isDayOff: false,
      isHoliday: false,
      isAdjusted: false,
      holidayInfo: undefined,
      nextPeriod: null,
      transition: undefined,
      shift: {
        id: '',
        shiftCode: '',
        name: '',
        startTime: '',
        endTime: '',
        workDays: [],
      },
      isLoading,
      isLocationLoading: locationLoading,
      error: attendanceError?.message || locationError,
      locationReady,
      locationState,
      checkInOut,
      refreshAttendanceStatus,
      getCurrentLocation,
    };
  }

  // Return complete data
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
    nextTransition: transitions[0] || null,
    isDayOff: context.schedule.isDayOff,
    isHoliday: context.schedule.isHoliday,
    isAdjusted: context.schedule.isAdjusted,
    holidayInfo: context.schedule.holidayInfo,
    nextPeriod: context.nextPeriod,
    transition: context.transition,
    shift: context.shift,
    isLoading,
    isLocationLoading: locationLoading,
    error: attendanceError?.message || locationError,
    locationReady,
    locationState,
    checkInOut,
    refreshAttendanceStatus,
    getCurrentLocation,
  };
}
