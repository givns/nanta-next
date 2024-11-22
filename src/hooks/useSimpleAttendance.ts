// hooks/useSimpleAttendance.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { KeyedMutator } from 'swr';
import axios from 'axios';
import {
  UseSimpleAttendanceProps,
  UseSimpleAttendanceState,
  UseSimpleAttendanceActions,
  UseSimpleAttendanceReturn,
  ProcessingResult,
  Location,
  AttendanceState,
  CheckStatus,
  PeriodType,
  CheckInOutData,
} from '@/types/attendance';

const PREMISES = [
  { name: 'บริษัท นันตา ฟู้ด', lat: 13.50821, lng: 100.76405, radius: 50 },
  { name: 'บริษัท ปัตตานี ฟู้ด', lat: 13.51444, lng: 100.70922, radius: 50 },
  {
    name: 'สำนักงานใหญ่',
    lat: 13.747920392683099,
    lng: 100.63441771348242,
    radius: 50,
  },
] as const;

const LOCATION_OPTIONS = {
  timeout: 10000,
  maximumAge: 0,
  enableHighAccuracy: true,
} as const;

interface LocationRef {
  inPremises: boolean;
  address: string;
}
type FetcherArgs = [url: string, employeeId: string, location: LocationRef];

export const useSimpleAttendance = ({
  employeeId,
  lineUserId,
  initialAttendanceStatus,
}: UseSimpleAttendanceProps): UseSimpleAttendanceReturn => {
  // Location state
  const [locationState, setLocationState] = useState({
    inPremises: false,
    address: '',
    isLoading: true,
    error: null as string | null,
  });

  const locationRef = useRef({
    inPremises: false,
    address: '',
  });

  // Location utilities
  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371e3;
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },
    [],
  );

  const isWithinPremises = useCallback(
    (lat: number, lng: number) => {
      const ERROR_MARGIN = 50;
      for (const premise of PREMISES) {
        const distance = calculateDistance(lat, lng, premise.lat, premise.lng);
        if (distance <= premise.radius + ERROR_MARGIN) {
          return premise;
        }
      }
      return null;
    },
    [calculateDistance],
  );

  // Properly typed SWR fetching
  const { data, error, mutate } = useSWR<
    UseSimpleAttendanceState,
    Error,
    FetcherArgs | null
  >(
    employeeId
      ? ['/api/attendance-status', employeeId, locationRef.current]
      : null,
    async (args: FetcherArgs) => {
      const [url, id, location] = args;
      const response = await axios.get(url, {
        params: {
          employeeId: id,
          lineUserId,
          inPremises: location.inPremises,
          address: location.address,
        },
      });

      return {
        attendanceStatus: response.data.attendanceStatus,
        state: response.data.attendanceStatus?.state || AttendanceState.ABSENT,
        checkStatus:
          response.data.attendanceStatus?.checkStatus || CheckStatus.PENDING,
        overtimeState: response.data.attendanceStatus?.overtimeState,
        effectiveShift: response.data.effectiveShift,
        currentPeriod: response.data.attendanceStatus?.currentPeriod || null,
        inPremises: location.inPremises,
        address: location.address,
        isLoading: false,
        isLocationLoading: locationState.isLoading,
        error: null,
        checkInOutAllowance: response.data.checkInOutAllowance,
      };
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 5000,
      fallbackData: initialAttendanceStatus
        ? {
            attendanceStatus: initialAttendanceStatus,
            state: initialAttendanceStatus.state,
            checkStatus: initialAttendanceStatus.checkStatus,
            overtimeState: initialAttendanceStatus.overtimeState,
            effectiveShift: null,
            currentPeriod: null,
            inPremises: false,
            address: '',
            isLoading: true,
            isLocationLoading: true,
            error: null,
            checkInOutAllowance: null,
          }
        : undefined,
    },
  );

  // Core functionality
  const getCurrentLocation = useCallback(async (): Promise<void> => {
    setLocationState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            LOCATION_OPTIONS,
          );
        },
      );

      const { latitude, longitude } = position.coords;
      const premise = isWithinPremises(latitude, longitude);
      const newInPremises = !!premise;
      const newAddress = premise ? premise.name : 'Unknown location';

      const newState = {
        inPremises: newInPremises,
        address: newAddress,
        isLoading: false,
        error: null,
      };

      setLocationState(newState);
      locationRef.current = {
        inPremises: newInPremises,
        address: newAddress,
      };
    } catch (error) {
      console.error('Location error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get location';

      setLocationState({
        inPremises: false,
        address: 'Unknown location',
        isLoading: false,
        error: `Failed to get location: ${errorMessage}`,
      });

      locationRef.current = {
        inPremises: false,
        address: 'Unknown location',
      };
    }
  }, [isWithinPremises]);

  const checkInOut = useCallback(
    async (data: CheckInOutData): Promise<ProcessingResult> => {
      try {
        // Get server time
        const serverTimeResponse = await axios.get('/api/server-time');
        const { serverTime } = serverTimeResponse.data;

        const requestData: CheckInOutData = {
          ...data,
          checkTime: serverTime,
          address: locationState.address,
          entryType: data.isOvertime ? PeriodType.OVERTIME : PeriodType.REGULAR,
        };

        const response = await axios.post<ProcessingResult>(
          '/api/check-in-out',
          requestData,
        );

        // Handle error in response data
        if (!response.data.success || response.data.errors) {
          throw new Error(
            response.data.errors || 'Failed to process attendance',
          );
        }

        await mutate();
        return response.data;
      } catch (error) {
        console.error('Check-in/out error:', error);

        // Handle timeout with retry
        if (axios.isAxiosError(error) && error.response?.status === 504) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return checkInOut(data); // Single retry
        }

        throw error;
      }
    },
    [mutate, locationState],
  );

  const refreshAttendanceStatus = useCallback(
    async (options?: { forceRefresh?: boolean; throwOnError?: boolean }) => {
      try {
        await mutate(undefined, {
          revalidate: options?.forceRefresh ?? true,
          throwOnError: options?.throwOnError,
        });
      } catch (error) {
        console.error('Refresh failed:', error);
        throw error;
      }
    },
    [mutate],
  ) as UseSimpleAttendanceActions['refreshAttendanceStatus'];

  // Assign mutate property to refreshAttendanceStatus
  Object.assign(refreshAttendanceStatus, { mutate });

  // Effect for initial location fetch
  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  // Return combined state and actions
  return {
    ...(data || {
      attendanceStatus: initialAttendanceStatus,
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      effectiveShift: null,
      currentPeriod: null,
      inPremises: locationState.inPremises,
      address: locationState.address,
      isLoading: true,
      isLocationLoading: locationState.isLoading,
      error: error?.message || locationState.error,
      checkInOutAllowance: null,
    }),
    refreshAttendanceStatus,
    checkInOut,
    getCurrentLocation,
  };
};
