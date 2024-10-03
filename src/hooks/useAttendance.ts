// hooks/useAttendance.ts
import { useState, useCallback } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
} from '../types/attendance';
import { UserData } from '../types/user';

export const useAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
): AttendanceHookReturn => {
  console.log('useAttendance hook initialized', {
    userData,
    initialAttendanceStatus,
  });

  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo>(initialAttendanceStatus);

  const getCurrentLocation = useCallback(async () => {
    console.log('Getting current location');
    return { lat: 0, lng: 0 };
  }, []);

  const fetchCheckInOutAllowance = useCallback(async (): Promise<void> => {
    console.log('Fetching check-in/out allowance');
    return;
  }, []);

  const getAttendanceStatus = useCallback(async () => {
    console.log('Getting attendance status');
    return attendanceStatus;
  }, [attendanceStatus]);

  const checkInOut = useCallback(async () => {
    console.log('Checking in/out');
    setAttendanceStatus((prev) => ({
      ...prev,
      isCheckingIn: !prev.isCheckingIn,
    }));
  }, []);

  console.log('useAttendance hook returning');

  return {
    attendanceStatus,
    isLoading: false,
    error: null,
    location: null,
    locationError: null,
    getCurrentLocation,
    effectiveShift: null,
    address: '',
    inPremises: false,
    isOutsideShift: false,
    checkInOut,
    checkInOutAllowance: { allowed: true },
    fetchCheckInOutAllowance,
    refreshAttendanceStatus: getAttendanceStatus,
    isSubmitting: false,
  };
};
