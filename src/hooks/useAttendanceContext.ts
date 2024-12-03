// hooks/useAttendanceContext.ts

import { AttendanceBaseResponse, ValidationResponse } from '@/types/attendance';
import useSWR from 'swr';
import { useEnhancedLocation } from './useEnhancedLocation';

export function useAttendanceContext(employeeId: string) {
  // Location handling
  const { locationState, locationReady, getCurrentLocation } =
    useEnhancedLocation();

  // Core attendance data
  const { data: baseData } = useSWR<AttendanceBaseResponse>(
    employeeId ? `/api/attendance/status/${employeeId}` : null,
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
    },
  );

  // Validation (depends on location)
  const { data: validation } = useSWR<ValidationResponse>(
    locationReady
      ? `/api/attendance/validate/${employeeId}?inPremises=${locationState.inPremises}&address=${locationState.address}`
      : null,
    {
      refreshInterval: 30000,
    },
  );

  return {
    isCheckingIn: baseData?.isCheckingIn ?? true,
    locationReady,
    validation,
    baseStatus: baseData,
    locationState,
    getCurrentLocation,
  };
}
