// hooks/useSimpleAttendance.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceHookReturn,
  CheckInOutAllowance,
  DEFAULT_ATTENDANCE_STATUS,
  AttendanceData,
} from '../types/attendance';
import axios from 'axios';
import { debounce } from 'lodash';
import useSWR from 'swr';

interface Premise {
  lat: number;
  lng: number;
  radius: number;
  name: string;
}
const PREMISES: Premise[] = [
  { lat: 13.50821, lng: 100.76405, radius: 50, name: 'บริษัท นันตา ฟู้ด' },
  { lat: 13.51444, lng: 100.70922, radius: 50, name: 'บริษัท ปัตตานี ฟู้ด' },
  {
    lat: 13.747920392683099,
    lng: 100.63441771348242,
    radius: 50,
    name: 'สำนักงานใหญ่',
  },
];

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export const useSimpleAttendance = (
  employeeId: string | undefined,
  lineUserId: string | null | undefined,
  initialAttendanceStatus: AttendanceStatusInfo | null,
): AttendanceHookReturn => {
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo>(
      initialAttendanceStatus || DEFAULT_ATTENDANCE_STATUS,
    );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [address, setAddress] = useState<string>('');
  const [inPremises, setInPremises] = useState<boolean>(false);
  const [isOutsideShift, setIsOutsideShift] = useState<boolean>(false);
  const [isLocationLoading, setIsLocationLoading] = useState(true);

  const { data, error, isValidating, mutate } = useSWR(
    employeeId
      ? ['/api/attendance-status', employeeId, inPremises, address]
      : null,
    ([url, id, inPremises, address]) =>
      fetcher(
        `${url}?employeeId=${id}&lineUserId=${lineUserId}&inPremises=${inPremises}&address=${encodeURIComponent(address)}`,
      ),
    {
      revalidateOnFocus: false,
      refreshInterval: 0,
    },
  );

  useEffect(() => {
    if (data) {
      setAttendanceStatus(data.attendanceStatus);
      setAddress(data.address || '');
      setInPremises(data.inPremises || false);
      setIsOutsideShift(data.isOutsideShift || false);
    }
  }, [data]);

  // Update the attendanceStatus when data is fetched
  useEffect(() => {
    if (data?.attendanceStatus) {
      setAttendanceStatus(data.attendanceStatus);
    }
  }, [data]);

  const processAttendanceStatus = useCallback(
    (status: AttendanceStatusInfo) => {
      console.log('Processing attendance status', status);

      if (status.latestAttendance) {
        const {
          checkInTime,
          checkOutTime,
          status: attendanceStatus,
        } = status.latestAttendance;
        status.detailedStatus = attendanceStatus;
        status.isCheckingIn = !!checkInTime && !checkOutTime;
        if (!checkInTime && !checkOutTime) {
          status.isCheckingIn = true;
          status.detailedStatus = 'pending';
        } else if (checkInTime && !checkOutTime) {
          status.isCheckingIn = false;
          status.detailedStatus = 'checked-in';
        } else if (checkInTime && checkOutTime) {
          status.isCheckingIn = true;
          status.detailedStatus = 'checked-out';
        }
      }
      return status;
    },
    [],
  );

  useEffect(() => {
    if (data) {
      const processedStatus = processAttendanceStatus(data.attendanceStatus);
      setAttendanceStatus(processedStatus);
    }
  }, [data, processAttendanceStatus]);

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

  const isWithinPremises = useCallback(
    (lat: number, lng: number): Premise | null => {
      const ERROR_MARGIN = 50; // 50 meters error margin
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

    console.log('getCurrentLocation called');

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 20000,
            maximumAge: 0,
          });
        },
      );

      const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      const premise = isWithinPremises(newLocation.lat, newLocation.lng);
      if (premise) {
        setAddress(premise.name);
        setInPremises(true);
      } else {
        setAddress('Unknown location');
        setInPremises(false);
      }

      setLocationError(null);
      return { inPremises, address }; // Add return statement with inPremises and address properties
    } catch (error) {
      console.error('Error getting location:', error);
      //setLocationError('Unable to get precise location.');
      //setAddress('Unknown location');
      //setInPremises(false);
    } finally {
      setIsLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('Component mounted, fetching location');
    getCurrentLocation();
  }, [getCurrentLocation]);

  useEffect(() => {
    console.log('Location state changed:', { inPremises, address });
  }, [inPremises, address]);

  useEffect(() => {
    console.log('Making API call with:', {
      employeeId,
      lineUserId,
      inPremises,
      address,
    });
  }, [employeeId, lineUserId, inPremises, address]);

  useEffect(() => {
    console.log('CheckInOutForm mounted');
    return () => console.log('CheckInOutForm unmounted');
  }, []);

  const checkInOut = useCallback(
    async (checkInOutData: AttendanceData) => {
      try {
        const response = await axios.post('/api/check-in-out', checkInOutData);
        await mutate();
        return response.data;
      } catch (error) {
        console.error('Error during check-in/out:', error);
        throw error;
      }
    },
    [mutate],
  );

  return {
    attendanceStatus: data?.attendanceStatus || initialAttendanceStatus,
    effectiveShift: data?.effectiveShift || null,
    isLoading: isValidating,
    error: error ? 'Failed to fetch attendance status' : null,
    inPremises,
    address,
    locationError,
    checkInOut,
    checkInOutAllowance: data?.checkInOutAllowance || null,
    refreshAttendanceStatus: mutate,
  };
};
