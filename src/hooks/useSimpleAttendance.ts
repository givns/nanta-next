// hooks/useSimpleAttendance.ts
import { useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
} from '../types/attendance';
import { UserData } from '../types/user';

export const useSimpleAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
): AttendanceHookReturn => {
  const [attendanceStatus] = useState(initialAttendanceStatus);

  console.log('useSimpleAttendance called with:', {
    userData,
    initialAttendanceStatus,
  });

  return {
    attendanceStatus,
    isLoading: false,
    error: null,
    location: null,
    locationError: null,
    getCurrentLocation: async () => ({ lat: 0, lng: 0 }),
    effectiveShift: null,
    address: '',
    inPremises: false,
    isOutsideShift: false,
    checkInOut: async () => {},
    checkInOutAllowance: { allowed: true },
    fetchCheckInOutAllowance: async () => {},
    refreshAttendanceStatus: async () => attendanceStatus,
    isSubmitting: false,
  };
};
