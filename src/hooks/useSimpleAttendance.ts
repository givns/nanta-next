import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
  AttendanceData,
  CurrentPeriodInfo,
  OvertimeAttendanceInfo,
} from '../types/attendance';
import axios from 'axios';
import useSWR from 'swr';
import { format, isWithinInterval, parseISO } from 'date-fns';

interface Premise {
  lat: number;
  lng: number;
  radius: number;
  name: string;
}

interface LocationState {
  inPremises: boolean;
  address: string;
  error: string | null;
  isLoading: boolean;
}

const PREMISES = [
  { name: 'บริษัท นันตา ฟู้ด', lat: 13.50821, lng: 100.76405, radius: 50 },
  { name: 'บริษัท ปัตตานี ฟู้ด', lat: 13.51444, lng: 100.70922, radius: 50 },
  {
    name: 'สำนักงานใหญ่',
    lat: 13.747920392683099,
    lng: 100.63441771348242,
    radius: 50,
  },
];

export const useSimpleAttendance = (
  employeeId: string | undefined,
  lineUserId: string | null | undefined,
  initialAttendanceStatus: AttendanceStatusInfo | null,
): AttendanceHookReturn => {
  const [inPremises, setInPremises] = useState<boolean>(false);
  const [address, setAddress] = useState<string>('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [locationState, setLocationState] = useState<LocationState>({
    inPremises: false,
    address: '',
    error: null,
    isLoading: true,
  });

  const locationRef = useRef({
    inPremises: false,
    address: '',
  });

  const [currentPeriod, setCurrentPeriod] = useState<CurrentPeriodInfo | null>(
    null,
  );

  useEffect(() => {
    console.log('useSimpleAttendance effect', {
      employeeId,
      lineUserId,
      inPremises,
      address,
    });
  }, [employeeId, lineUserId, inPremises, address]);

  // SWR fetcher with location context
  const { data, error, isValidating, mutate } = useSWR(
    employeeId
      ? [
          '/api/attendance-status',
          employeeId,
          locationRef.current.inPremises,
          locationRef.current.address,
        ]
      : null,
    async ([url, id, inPremises, address]) => {
      console.log('Fetching attendance status:', { id, inPremises, address });
      const response = await axios.get(url, {
        params: {
          employeeId: id,
          lineUserId,
          inPremises,
          address,
        },
      });

      // Determine current period from response
      const status = response.data.attendanceStatus;
      const currentTime = format(new Date(), 'HH:mm');

      // Check if there's an active overtime period
      const activeOvertime = status.overtimeAttendances?.find(
        (ot: OvertimeAttendanceInfo) => {
          const start = parseISO(`2000-01-01T${ot.overtimeRequest.startTime}`);
          let end = parseISO(`2000-01-01T${ot.overtimeRequest.endTime}`);
          const current = parseISO(`2000-01-01T${currentTime}`);

          if (end < start) {
            // Handle overnight overtime
            return current >= start || current <= end;
          }
          return isWithinInterval(current, { start, end });
        },
      );

      // Set current period based on status
      const newCurrentPeriod: CurrentPeriodInfo = activeOvertime
        ? {
            type: 'overtime',
            overtimeId: activeOvertime.overtimeRequest.id,
            isComplete: activeOvertime.periodStatus.isComplete,
            checkInTime: activeOvertime.attendance?.checkInTime,
            checkOutTime: activeOvertime.attendance?.checkOutTime,
          }
        : {
            type: 'regular',
            isComplete: !!status.latestAttendance?.checkOutTime,
            checkInTime: status.latestAttendance?.checkInTime,
            checkOutTime: status.latestAttendance?.checkOutTime,
          };

      setCurrentPeriod(newCurrentPeriod);

      return {
        ...response.data,
        checkInOutAllowance: {
          ...response.data.checkInOutAllowance,
          inPremises,
          periodType: newCurrentPeriod.type,
          overtimeId:
            newCurrentPeriod.type === 'overtime'
              ? newCurrentPeriod.overtimeId
              : undefined,
        },
      };
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 60000, // Check every minute for period changes
      dedupingInterval: 5000,
    },
  );

  useEffect(() => {
    console.log('checkInOutAllowance updated:', data?.checkInOutAllowance);
  }, [data?.checkInOutAllowance]);

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
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
  };

  const isWithinPremises = useCallback(
    (lat: number, lng: number): Premise | null => {
      const ERROR_MARGIN = 50;
      for (const premise of PREMISES) {
        const distance = calculateDistance(lat, lng, premise.lat, premise.lng);
        if (distance <= premise.radius + ERROR_MARGIN) {
          return premise;
        }
      }
      return null;
    },
    [],
  );

  // Location handling
  const getCurrentLocation = useCallback(async () => {
    setIsLocationLoading(true);
    setLocationError(null);

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 0,
          });
        },
      );

      console.log('Position obtained:', position);
      const { latitude, longitude } = position.coords;
      const premise = isWithinPremises(latitude, longitude);

      console.log('Premise check result:', premise);

      const newInPremises = !!premise;
      const newAddress = premise ? premise.name : 'Unknown location';

      setLocationState({
        inPremises: newInPremises,
        address: newAddress,
        error: null,
        isLoading: false,
      });

      locationRef.current = { inPremises: newInPremises, address: newAddress };
      console.log('Location updated:', {
        inPremises: newInPremises,
        address: newAddress,
      });
    } catch (error) {
      console.error('Location error:', error);
      setLocationState({
        inPremises: false,
        address: 'Unknown location',
        error: 'Failed to get location. Please check your GPS settings.',
        isLoading: false,
      });
      locationRef.current = { inPremises: false, address: 'Unknown location' };
    } finally {
      setIsLocationLoading(false);
    }
  }, [isWithinPremises]);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  // Check-in/out handling
  const checkInOut = useCallback(
    async (checkInOutData: AttendanceData, retryCount = 0) => {
      const MAX_RETRIES = 2;
      const BASE_TIMEOUT = 20000;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BASE_TIMEOUT);

        const response = await axios.post(
          '/api/check-in-out',
          {
            ...checkInOutData,
            inPremises: locationState.inPremises,
            address: locationState.address,
            periodType: currentPeriod?.type,
            overtimeId:
              currentPeriod?.type === 'overtime'
                ? currentPeriod.overtimeId
                : undefined,
          },
          {
            signal: controller.signal,
            timeout: BASE_TIMEOUT,
          },
        );

        clearTimeout(timeoutId);

        if (response.data.error) {
          throw new Error(response.data.message || 'Failed to update status');
        }

        await mutate();
        return response.data;
      } catch (error: any) {
        if (
          error.code === 'ECONNABORTED' ||
          error.name === 'AbortError' ||
          error.response?.status === 504
        ) {
          if (retryCount < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return checkInOut(checkInOutData, retryCount + 1);
          }
        }

        throw error;
      }
    },
    [mutate, locationState, currentPeriod],
  );

  return {
    attendanceStatus: data?.attendanceStatus || initialAttendanceStatus,
    effectiveShift: data?.effectiveShift || null,
    currentPeriod,
    isLoading: isValidating || locationState.isLoading,
    error: error?.message || locationState.error || null,
    inPremises: locationState.inPremises,
    address: locationState.address,
    checkInOut,
    checkInOutAllowance: data?.checkInOutAllowance || null,
    refreshAttendanceStatus: mutate,
    getCurrentLocation,
  };
};
