// hooks/useAttendanceTransition.ts
import { useCallback, useMemo } from 'react';
import { PeriodType } from '@prisma/client';
import { parseISO, isWithinInterval, subMinutes } from 'date-fns';
import { getCurrentTime } from '@/utils/dateUtils';

interface UseAttendanceTransitionProps {
  currentPeriod: {
    type: PeriodType;
    timeWindow: {
      start: string;
      end: string;
    };
  };
  nextPeriod?: {
    type: PeriodType;
    overtimeInfo?: {
      id: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
    };
  } | null;
  validation: {
    flags: {
      hasPendingTransition: boolean;
      isInsideShift: boolean;
    };
  };
}

export function useAttendanceTransition({
  currentPeriod,
  nextPeriod,
  validation,
}: UseAttendanceTransitionProps) {
  // Check if we're in transition window
  const isInTransitionWindow = useMemo(() => {
    if (!currentPeriod.timeWindow.end || !nextPeriod?.overtimeInfo)
      return false;

    const now = getCurrentTime();
    const periodEnd = parseISO(currentPeriod.timeWindow.end);

    return isWithinInterval(now, {
      start: subMinutes(periodEnd, 15),
      end: periodEnd,
    });
  }, [currentPeriod.timeWindow.end, nextPeriod]);

  // Get overtime information if available
  const overtimeInfo = useMemo(() => {
    if (!nextPeriod?.overtimeInfo) return null;

    return {
      id: nextPeriod.overtimeInfo.id,
      duration: nextPeriod.overtimeInfo.durationMinutes,
      startTime: nextPeriod.overtimeInfo.startTime,
      endTime: nextPeriod.overtimeInfo.endTime,
    };
  }, [nextPeriod]);

  // Determine if transition is available
  const canTransition = useMemo(() => {
    return (
      validation.flags.hasPendingTransition &&
      validation.flags.isInsideShift &&
      isInTransitionWindow &&
      nextPeriod?.type === PeriodType.OVERTIME &&
      !!overtimeInfo
    );
  }, [validation.flags, isInTransitionWindow, nextPeriod, overtimeInfo]);

  // Format transition time display
  const getTransitionDisplay = useCallback(() => {
    if (!overtimeInfo) return null;

    return {
      time: overtimeInfo.startTime,
      duration: `${overtimeInfo.duration} นาที`,
      type: 'overtime' as const,
    };
  }, [overtimeInfo]);

  return {
    isInTransitionWindow,
    canTransition,
    overtimeInfo,
    getTransitionDisplay,
  };
}
