// hooks/useShiftDetails.ts

import { useState, useEffect, useCallback } from 'react';
import { AttendanceStatusInfo, ShiftData } from '../types/user';
import axios from 'axios';

export const useShiftDetails = (
  attendanceStatus: AttendanceStatusInfo | null,
) => {
  const [isWithinShift, setIsWithinShift] = useState(false);
  const [isBeforeShift, setIsBeforeShift] = useState(false);
  const [isAfterShift, setIsAfterShift] = useState(false);
  const [minutesUntilShiftStart, setMinutesUntilShiftStart] = useState(0);
  const [minutesUntilShiftEnd, setMinutesUntilShiftEnd] = useState(0);

  const fetchShiftDetails = useCallback(async () => {
    if (!attendanceStatus) return;

    const now = new Date();
    let shift = attendanceStatus.user.assignedShift;

    if (attendanceStatus.shiftAdjustment) {
      try {
        const response = await axios.get(
          `/api/shifts/${attendanceStatus.shiftAdjustment.requestedShiftId}`,
        );
        shift = response.data;
      } catch (error) {
        console.error('Error fetching requested shift:', error);
      }
    }

    if (!shift) {
      console.log('No shift data available');
      setIsWithinShift(false);
      setIsBeforeShift(false);
      setIsAfterShift(false);
      setMinutesUntilShiftStart(0);
      setMinutesUntilShiftEnd(0);
      return;
    }

    const shiftData: ShiftData = {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays,
      shiftCode: shift.shiftCode,
    };

    updateShiftStatus(shiftData, now);
  }, [attendanceStatus]);

  const updateShiftStatus = (shift: ShiftData, now: Date) => {
    const [startHour, startMinute] = (shift.startTime || '00:00')
      .split(':')
      .map(Number);
    const [endHour, endMinute] = (shift.endTime || '23:59')
      .split(':')
      .map(Number);

    const shiftStart = new Date(now);
    shiftStart.setHours(startHour, startMinute, 0, 0);

    const shiftEnd = new Date(now);
    shiftEnd.setHours(endHour, endMinute, 0, 0);

    if (
      endHour < startHour ||
      (endHour === startHour && endMinute < startMinute)
    ) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
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
    fetchShiftDetails();
  }, [fetchShiftDetails]);

  return {
    isWithinShift,
    isBeforeShift,
    isAfterShift,
    minutesUntilShiftStart,
    minutesUntilShiftEnd,
    updateShiftStatus,
  };
};
