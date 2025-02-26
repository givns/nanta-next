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
import { addHours } from 'date-fns';

export function useSimpleAttendance({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
  shiftId,
  enabled = true,
}: UseSimpleAttendanceProps & { shiftId?: string }): UseSimpleAttendanceReturn {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isDataReady, setIsDataReady] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  const {
    locationState,
    locationReady,
    locationVerified,
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
    // Add these conditions
    locationReady:
      locationReady ||
      locationState.status === 'waiting_admin' ||
      locationState.status === 'pending_admin',
    locationVerified:
      locationVerified || locationState.verificationStatus === 'admin_pending',
    initialAttendanceStatus,
    shiftId,
    enabled,
  });

  // Update the error handling to catch and transform errors
  useEffect(() => {
    if (attendanceError) {
      console.error('Attendance error detected:', attendanceError);
      setLastError(
        attendanceError instanceof Error
          ? attendanceError
          : new Error(String(attendanceError)),
      );
    } else {
      setLastError(null);
    }
  }, [attendanceError]);

  // Add debug logging
  useEffect(() => {
    console.log('Simple attendance data update:', {
      hasRawData: !!rawData,
      hasBase: !!rawData?.base,
      state: rawData?.base?.state,
      context: rawData?.context?.shift?.id,
    });
  }, [rawData]);

  useEffect(() => {
    console.log('Attendance enable conditions:', {
      propsEnabled: enabled,
      locationReady,
      locationVerified,
      shouldEnable: enabled && locationReady && locationVerified,
    });
  }, [enabled, locationReady, locationVerified]);

  console.log('Attendance data enable conditions:', {
    props: {
      enabled,
      locationReady,
      locationVerified,
    },
    state: locationState,
  });

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

  // Initialize state
  useEffect(() => {
    const initTimeout = setTimeout(() => {
      if (isInitializing) {
        setIsInitializing(false);
      }
    }, 3000); // Set a max initialization time of 3 seconds

    return () => clearTimeout(initTimeout);
  }, [isInitializing]);

  // Modified data ready check
  useEffect(() => {
    if (rawData?.base && !isDataReady) {
      console.log('Data ready check:', {
        hasBase: !!rawData.base,
        state: rawData.base.state,
        hasContext: !!rawData.context,
        hasShift: !!rawData.context?.shift?.id,
      });
      setIsDataReady(true);
      setIsInitializing(false);
    }
  }, [rawData, isDataReady]);

  // Modified base state to handle loading case
  const baseState = useMemo((): AttendanceBaseResponse => {
    console.log('Computing base state:', {
      hasRawData: !!rawData,
      hasBase: !!rawData?.base,
      state: rawData?.base?.state,
    });

    if (rawData?.base) {
      return {
        ...rawData.base,
        metadata: {
          lastUpdated:
            rawData.base.metadata?.lastUpdated ||
            getCurrentTime().toISOString(),
          version: rawData.base.metadata?.version || 1,
          source: rawData.base.metadata?.source || 'system',
        },
        periodInfo: {
          type: rawData.base.periodInfo?.type || PeriodType.REGULAR,
          isOvertime: rawData.base.periodInfo?.isOvertime || false,
          overtimeState: rawData.base.periodInfo?.overtimeState,
        },
        validation: {
          canCheckIn: Boolean(rawData.base.validation?.canCheckIn),
          canCheckOut: Boolean(rawData.base.validation?.canCheckOut),
          message: rawData.base.validation?.message || '',
        },
      };
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

  // Update the periodState memo
  const periodState = useMemo((): UnifiedPeriodState => {
    if (rawData?.daily?.currentState) {
      const currentState = rawData.daily.currentState;
      console.log('Using raw period state:', {
        type: currentState.type,
        timeWindow: currentState.timeWindow,
        activity: currentState.activity,
      });

      return {
        ...currentState,
        timeWindow: currentState.timeWindow,
        activity: {
          ...currentState.activity,
          // Do not modify time values
          checkIn: currentState.activity.checkIn,
          checkOut: currentState.activity.checkOut,
        },
        validation: currentState.validation,
      };
    }

    // Return default period state
    console.log('Using default period state');
    const now = getCurrentTime();
    return {
      type: PeriodType.REGULAR,
      timeWindow: {
        start: now.toISOString(),
        end: addHours(now, 8).toISOString(),
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
    errors: [],
    warnings: [],
    allowed: false,
    reason: '',
    flags: {
      hasActivePeriod: false,
      isInsideShift: false,
      isOutsideShift: false,
      isCheckingIn: true, // Added - default to true since no activity
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
      requireConfirmation: false, // Added
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
      // Added
      additionalInfo: {},
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

  // Modified loading state check with additional error handling
  const isLoading =
    isInitializing ||
    locationLoading ||
    isAttendanceLoading ||
    !context?.shift?.id;

  // Handle the error retry mechanism
  const retryAttendanceLoad = async () => {
    setLastError(null);
    try {
      await refreshAttendanceStatus();
    } catch (error) {
      console.error('Error retrying attendance data load:', error);
      setLastError(
        error instanceof Error
          ? error
          : new Error('Failed to refresh attendance data'),
      );
    }
  };

  // Only return complete data when ready
  if (!rawData?.base) {
    console.log('Returning loading state:', {
      hasBase: !!rawData?.base,
      hasContext: !!rawData?.context,
      initialStatus: !!initialAttendanceStatus,
      hasError: !!lastError || !!attendanceError,
    });

    // Return initial or default state while loading
    return {
      state: baseState.state,
      checkStatus: baseState.checkStatus,
      isCheckingIn: baseState.isCheckingIn,
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
      shift: null,
      isLoading: true,
      isLocationLoading: locationLoading,
      error: lastError?.message || attendanceError?.message || locationError,
      locationReady,
      locationState,
      checkInOut,
      refreshAttendanceStatus: retryAttendanceLoad, // Use our enhanced retry function
      getCurrentLocation,
    };
  }

  console.log('Returning complete state with:', {
    periodState: rawData.daily.currentState,
    timeWindow: rawData.daily.currentState.timeWindow,
    hasTransitions: rawData.daily.transitions.length,
  });

  // Return complete data with actual server response
  return {
    // Base states
    state: rawData.base.state,
    checkStatus: rawData.base.checkStatus,
    isCheckingIn: rawData.base.isCheckingIn,
    base: rawData.base,

    // Period and validation states
    periodState: rawData.daily.currentState, // Use raw state directly
    stateValidation: rawData.validation,

    // Context and transitions
    context: rawData.context,
    transitions: rawData.daily.transitions,
    hasPendingTransition: Boolean(
      rawData.daily.transitions.length > 0 ||
        rawData.context.transition?.isInTransition ||
        rawData.validation.flags.hasPendingTransition,
    ),
    nextTransition: rawData.daily.transitions[0] || null,

    // Schedule info
    isDayOff: rawData.context.schedule.isDayOff,
    isHoliday: rawData.context.schedule.isHoliday,
    isAdjusted: rawData.context.schedule.isAdjusted,
    holidayInfo: rawData.context.schedule.holidayInfo,

    // Period transitions
    nextPeriod: rawData.context.nextPeriod,
    transition: rawData.context.transition,

    // Shift data
    shift: rawData.context.shift,

    // Loading and error states
    isLoading: false,
    isLocationLoading: locationLoading,
    error: lastError?.message || attendanceError?.message || locationError,

    // Location states
    locationReady,
    locationState,

    // Actions
    checkInOut,
    refreshAttendanceStatus,
    getCurrentLocation,
  };
}
