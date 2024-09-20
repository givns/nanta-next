// hooks/useShiftDetails.ts

import { useState, useEffect, useCallback } from 'react';
import { AttendanceStatusInfo, ShiftData } from '../types/attendance';
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
    if (!attendanceStatus || !attendanceStatus.user.shiftCode) return;

    const now = new Date();
    let shift: ShiftData | null = null;

    try {
      if (attendanceStatus.shiftAdjustment) {
        const response = await axios.get(
          `/api/shifts/${attendanceStatus.shiftAdjustment.requestedShiftId}`,
        );
        shift = response.data;
      } else {
        const response = await axios.get(
          `/api/shifts/by-code/${attendanceStatus.user.shiftCode}`,
        );
        shift = response.data;
      }
    } catch (error) {
      console.error('Error fetching shift details:', error);
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

    updateShiftStatus(shift, now);
  }, [attendanceStatus]);

  const updateShiftStatus = (shift: ShiftData, now: Date) => {
    if (!shift) {
      return;
    }

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
