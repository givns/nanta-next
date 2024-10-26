// hooks/useShiftDetails.ts
import { useState, useEffect, useCallback } from 'react';
import { AttendanceStatusInfo, ShiftData } from '../types/attendance';
import { getShiftByCode, getShiftById } from '@/lib/shiftCache';
import { Shift } from '@prisma/client';

export const useShiftDetails = (
  attendanceStatus: AttendanceStatusInfo | null,
) => {
  const [isWithinShift, setIsWithinShift] = useState(false);
  const [isBeforeShift, setIsBeforeShift] = useState(false);
  const [isAfterShift, setIsAfterShift] = useState(false);
  const [minutesUntilShiftStart, setMinutesUntilShiftStart] = useState(0);
  const [minutesUntilShiftEnd, setMinutesUntilShiftEnd] = useState(0);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);

  const convertToShiftData = useCallback((shift: Shift): ShiftData => {
    return {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays,
      shiftCode: shift.shiftCode,
    };
  }, []);

  const loadShiftData = useCallback(async () => {
    if (!attendanceStatus?.user.shiftCode) return;

    try {
      let shift: Shift | null = null;

      if (attendanceStatus.shiftAdjustment?.requestedShiftId) {
        shift = await getShiftById(
          attendanceStatus.shiftAdjustment.requestedShiftId,
        );
      } else {
        shift = await getShiftByCode(attendanceStatus.user.shiftCode);
      }

      if (shift) {
        setCurrentShift(shift);
        updateShiftStatus(convertToShiftData(shift), new Date());
      }
    } catch (error) {
      console.error('Error loading shift data:', error);
    }
  }, [attendanceStatus, convertToShiftData]);

  const updateShiftStatus = (shift: ShiftData, now: Date) => {
    if (!shift) return;

    const [startHour, startMinute] = shift.startTime.split(':').map(Number);
    const [endHour, endMinute] = shift.endTime.split(':').map(Number);

    const shiftStart = new Date(now);
    shiftStart.setHours(startHour, startMinute, 0, 0);

    const shiftEnd = new Date(now);
    shiftEnd.setHours(endHour, endMinute, 0, 0);

    // Handle overnight shifts
    if (
      endHour < startHour ||
      (endHour === startHour && endMinute < startMinute)
    ) {
      if (now < shiftEnd) {
        shiftStart.setDate(shiftStart.getDate() - 1);
      } else {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }
    }

    const isWithinShift = now >= shiftStart && now <= shiftEnd;
    const isBeforeShift = now < shiftStart;
    const isAfterShift = now > shiftEnd;

    const minutesUntilShiftStart = isBeforeShift
      ? Math.floor((shiftStart.getTime() - now.getTime()) / 60000)
      : 0;
    const minutesUntilShiftEnd = isWithinShift
      ? Math.floor((shiftEnd.getTime() - now.getTime()) / 60000)
      : 0;

    setIsWithinShift(isWithinShift);
    setIsBeforeShift(isBeforeShift);
    setIsAfterShift(isAfterShift);
    setMinutesUntilShiftStart(minutesUntilShiftStart);
    setMinutesUntilShiftEnd(minutesUntilShiftEnd);
  };

  useEffect(() => {
    loadShiftData();

    // Update every minute
    const interval = setInterval(() => {
      if (currentShift) {
        updateShiftStatus(convertToShiftData(currentShift), new Date());
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [loadShiftData, currentShift, convertToShiftData]);

  return {
    isWithinShift,
    isBeforeShift,
    isAfterShift,
    minutesUntilShiftStart,
    minutesUntilShiftEnd,
    currentShift,
    updateShiftStatus,
  };
};
