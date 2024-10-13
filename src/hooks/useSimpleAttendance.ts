import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
  AttendanceData,
} from '../types/attendance';
import axios from 'axios';
import useSWR from 'swr';

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

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

const checkIfInPremises = (latitude: number, longitude: number): boolean => {
  const ERROR_MARGIN = 50; // 50 meters error margin
  for (const premise of PREMISES) {
    const distance = calculateDistance(
      latitude,
      longitude,
      premise.lat,
      premise.lng,
    );
    if (distance <= premise.radius + ERROR_MARGIN) {
      return true;
    }
  }
  return false;
};

const getPremiseName = (latitude: number, longitude: number): string => {
  const ERROR_MARGIN = 50; // 50 meters error margin
  for (const premise of PREMISES) {
    const distance = calculateDistance(
      latitude,
      longitude,
      premise.lat,
      premise.lng,
    );
    if (distance <= premise.radius + ERROR_MARGIN) {
      return premise.name;
    }
  }
  return 'Unknown location';
};

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export const useSimpleAttendance = (
  employeeId: string | undefined,
  lineUserId: string | null | undefined,
  initialAttendanceStatus: AttendanceStatusInfo | null,
): AttendanceHookReturn => {
  const [inPremises, setInPremises] = useState(false);
  const [address, setAddress] = useState('');

  const { data, error, isValidating, mutate } = useSWR(
    employeeId
      ? ['/api/attendance-status', employeeId, inPremises, address]
      : null,
    async ([url, id, inPremises, address]) => {
      console.log('SWR fetcher called with:', { id, inPremises, address });
      return fetcher(
        `${url}?employeeId=${id}&lineUserId=${lineUserId}&inPremises=${inPremises}&address=${encodeURIComponent(address)}`,
      );
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 0,
      dedupingInterval: 5000,
    },
  );

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const isInPremises = checkIfInPremises(latitude, longitude);
        setInPremises(isInPremises);
        setAddress(
          isInPremises
            ? getPremiseName(latitude, longitude)
            : 'Unknown location',
        );
      },
      (error) => {
        console.error('Error getting location:', error);
        setInPremises(false);
        setAddress('Unknown location');
      },
      { timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  const checkInOut = useCallback(
    async (checkInOutData: AttendanceData) => {
      try {
        const response = await axios.post('/api/check-in-out', {
          ...checkInOutData,
          inPremises,
          address,
        });
        await mutate();
        return response.data;
      } catch (error) {
        console.error('Error during check-in/out:', error);
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
