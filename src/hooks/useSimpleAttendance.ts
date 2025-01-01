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

  // Add this right after the useAttendanceData hook
  // Debug effects to track data flow
  useEffect(() => {
    console.log('Location state:', locationState);
  }, [locationState]);

  useEffect(() => {
    if (rawData) {
      console.log('Raw attendance data:', {
        hasBase: !!rawData.base,
        hasContext: !!rawData.context,
        hasTransitions: rawData.daily?.transitions?.length || 0,
        context: rawData.context,
        validation: rawData.validation,
      });
    }
  }, [rawData]);

  // Modified data ready check
  useEffect(() => {
    if (rawData?.context?.shift?.id && !isDataReady) {
      console.log('Data is ready with shift:', rawData.context.shift);
      setIsDataReady(true);
    }
  }, [rawData, isDataReady]);

  // Modified base state to handle loading case
  const baseState = useMemo((): AttendanceBaseResponse => {
    if (!rawData && initialAttendanceStatus?.base) {
      console.log('Using initial attendance status base');
      return initialAttendanceStatus.base;
    }

    if (rawData?.base) {
      console.log('Using raw data base');
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
  }, [rawData?.base, initialAttendanceStatus]);

  // Modified period state to prioritize initial data
  const periodState = useMemo((): UnifiedPeriodState => {
    if (rawData?.daily?.currentState) {
      console.log('Using raw data period state');
      return rawData.daily.currentState;
    }

    if (initialAttendanceStatus?.daily?.currentState) {
      console.log('Using initial attendance status period state');
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
  }, [rawData?.daily?.currentState, initialAttendanceStatus]);

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

  // Modified context handling to always wait for real data
  const context = useMemo(() => {
    if (rawData?.context) {
      console.log('Using raw data context');
      return rawData.context;
    }

    if (initialAttendanceStatus?.context) {
      console.log('Using initial attendance status context');
      return initialAttendanceStatus.context;
    }

    return null;
  }, [rawData?.context, initialAttendanceStatus]);

  // Enhanced transitions handling
  const transitions = useMemo(() => {
    const currentTransitions = rawData?.daily?.transitions || [];
    console.log('Current transitions:', currentTransitions);
    return currentTransitions;
  }, [rawData?.daily?.transitions]);

  const hasPendingTransition = useMemo(() => {
    const hasTransition = Boolean(
      transitions.length > 0 ||
        context?.transition?.isInTransition ||
        rawData?.validation?.flags.hasPendingTransition,
    );
    console.log('Pending transition:', hasTransition);
    return hasTransition;
  }, [
    transitions,
    context?.transition,
    rawData?.validation?.flags.hasPendingTransition,
  ]);

  // Modified loading state check
  const isLoading =
    isInitializing ||
    locationLoading ||
    isAttendanceLoading ||
    !context?.shift?.id;

  // Only return complete data when we have real data
  if (!context?.shift?.id) {
    console.log('Returning loading state - waiting for shift data');
    return {
      state: initialAttendanceStatus?.base?.state || AttendanceState.ABSENT,
      checkStatus:
        initialAttendanceStatus?.base?.checkStatus || CheckStatus.PENDING,
      isCheckingIn: initialAttendanceStatus?.base?.isCheckingIn ?? true,
      base: baseState,
      periodState: initialAttendanceStatus?.daily?.currentState || periodState,
      stateValidation:
        initialAttendanceStatus?.validation || defaultStateValidation,
      context: initialAttendanceStatus?.context || {
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
      shift: initialAttendanceStatus?.context?.shift || null,
      isLoading: true,
      isLocationLoading: locationLoading,
      error: attendanceError?.message || locationError,
      locationReady,
      locationState,
      checkInOut,
      refreshAttendanceStatus,
      getCurrentLocation,
    };
  }

  console.log('Returning complete state with data');
  // Return complete data only when we have real shift data
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
