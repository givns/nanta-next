import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
  AttendanceData,
} from '../types/attendance';
import axios from 'axios';
import useSWR from 'swr';

interface Premise {
  lat: number;
  lng: number;
  radius: number;
  name: string;
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
  const [locationState, setLocationState] = useState<{
    inPremises: boolean;
    address: string;
    error: string | null;
    isLoading: boolean;
  }>({
    inPremises: false,
    address: '',
    error: null,
    isLoading: true,
  });

  const locationRef = useRef({
    inPremises: false,
    address: '',
  });

  useEffect(() => {
    console.log('useSimpleAttendance effect', {
      employeeId,
      lineUserId,
      inPremises,
      address,
    });
  }, [employeeId, lineUserId, inPremises, address]);

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

      setInPremises(newInPremises);
      setAddress(newAddress);
      locationRef.current = { inPremises: newInPremises, address: newAddress };
      console.log('Location updated:', {
        inPremises: newInPremises,
        address: newAddress,
      });
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError(
        'Failed to get location. Please check your GPS settings and try again.',
      );
      setInPremises(false);
      setAddress('Unknown location');
      locationRef.current = { inPremises: false, address: 'Unknown location' };
    } finally {
      setIsLocationLoading(false);
    }
  }, [isWithinPremises]);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

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
      console.log('SWR fetcher called with:', { id, inPremises, address });
      const response = await axios.get(url, {
        params: { employeeId: id, lineUserId, inPremises, address },
      });
      // Ensure inPremises is included in checkInOutAllowance
      if (response.data.checkInOutAllowance) {
        response.data.checkInOutAllowance.inPremises = inPremises;
      }
      return response.data;
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 0,
      dedupingInterval: 5000,
    },
  );

  useEffect(() => {
    console.log('checkInOutAllowance updated:', data?.checkInOutAllowance);
  }, [data?.checkInOutAllowance]);

  const checkInOut = useCallback(
    async (checkInOutData: AttendanceData, retryCount = 0) => {
      const MAX_RETRIES = 2;
      const BASE_TIMEOUT = 20000; // 20 seconds

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BASE_TIMEOUT);

        console.log('Attempting check-in/out:', {
          attempt: retryCount + 1,
          timestamp: new Date().toISOString(),
        });

        const response = await axios.post(
          '/api/check-in-out',
          {
            ...checkInOutData,
            inPremises,
            address,
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
        console.error('Check-in/out error:', error);

        // Handle timeout cases
        if (
          error.code === 'ECONNABORTED' ||
          error.name === 'AbortError' ||
          error.response?.status === 504
        ) {
          if (retryCount < MAX_RETRIES) {
            console.log(
              `Retrying check-in/out (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`,
            );

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000));

            return checkInOut(checkInOutData, retryCount + 1);
          }

          throw new Error(
            'Request took too long. Please check your attendance status and try again if needed.',
          );
        }

        // Handle other errors
        if (axios.isAxiosError(error)) {
          throw new Error(
            error.response?.data?.message ||
              'Failed to update status. Please try again.',
          );
        }

        throw error;
      }
    },
    [mutate, inPremises, address],
  );

  return {
    attendanceStatus: data?.attendanceStatus || initialAttendanceStatus,
    effectiveShift: data?.effectiveShift || null,
    isLoading: isValidating,
    error: error ? 'Failed to fetch attendance status' : null,
    inPremises,
    address,
    checkInOut,
    checkInOutAllowance: data?.checkInOutAllowance || null,
    refreshAttendanceStatus: mutate,
    getCurrentLocation,
  };
};
