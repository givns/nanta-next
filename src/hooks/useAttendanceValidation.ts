// hooks/useAttendanceValidation.ts

import { LocationState, ValidationResult } from '@/types/attendance';
import useSWR from 'swr';

export function useAttendanceValidation(
  employeeId: string,
  locationState: LocationState,
) {
  const { data, error, mutate } = useSWR<ValidationResult>(
    employeeId && locationState
      ? `/api/attendance/validate/${employeeId}?inPremises=${locationState.inPremises}&address=${locationState.address}`
      : null,
    {
      refreshInterval: 30000, // More frequent updates for validation
    },
  );

  return {
    validation: data,
    isLoading: !data && !error,
    error,
    refresh: mutate,
  };
}
