// hooks/useAttendance.ts

import { useState, useCallback, useEffect } from 'react';
import {
  AttendanceStatusInfo,
  AttendanceData,
  ShiftData,
} from '../types/attendance';
import { getShiftDetails } from '@/utils/shiftUtils';
import { UserData } from '../types/user';
import axios from 'axios';
import {
  parseISO,
  isAfter,
  addMinutes,
  subHours,
  addHours,
  isBefore,
  isSameDay,
  setHours,
  setMinutes,
  startOfDay,
  subMinutes,
} from 'date-fns';
import { zonedTimeToUtc } from '../utils/dateUtils';

const TIMEZONE = 'Asia/Bangkok';

interface Premise {
  lat: number;
  lng: number;
  radius: number;
  name: string;
}

const PREMISES: Premise[] = [
  { lat: 13.50821, lng: 100.76405, radius: 100, name: 'บริษัท นันตา ฟู้ด' },
  { lat: 13.51444, lng: 100.70922, radius: 100, name: 'บริษัท ปัตตานี ฟู้ด' },
  {
    lat: 13.747920392683099,
    lng: 100.63441771348242,
    radius: 100,
    name: 'สำนักงานใหญ่',
  },
];

export const useAttendance = (
  userData: UserData,
  initialAttendanceStatus: AttendanceStatusInfo,
) => {
  const [attendanceStatus, setAttendanceStatus] = useState(
    initialAttendanceStatus,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [inPremises, setInPremises] = useState(false);
  const [isOutsideShift, setIsOutsideShift] = useState(false);

  const getEffectiveShift = useCallback(async () => {
    try {
      const now = zonedTimeToUtc(new Date(), TIMEZONE);
      const yesterday = subHours(now, 24);

      const shiftAdjustment =
        attendanceStatus.shiftAdjustment ||
        attendanceStatus.futureShifts.find(
          (adj) =>
            isSameDay(parseISO(adj.date), now) ||
            isSameDay(parseISO(adj.date), yesterday),
        );

      let shift: ShiftData;
      if (shiftAdjustment) {
        if ('requestedShift' in shiftAdjustment) {
          shift = shiftAdjustment.requestedShift;
        } else if ('shift' in shiftAdjustment) {
          shift = shiftAdjustment.shift;
        } else {
          throw new Error('Invalid shift adjustment structure');
        }
      } else if (userData.shiftCode) {
        // Fetch shift based on shiftCode
        shift = await getShiftDetails(userData.shiftCode);
      } else {
        throw new Error('No shift data or shiftCode found');
      }

      if (!shift) {
        console.error('No shift data found');
        return null;
      }

      const [startHour, startMinute] = shift.startTime.split(':').map(Number);
      const [endHour, endMinute] = shift.endTime.split(':').map(Number);

      let shiftStart = zonedTimeToUtc(
        setHours(setMinutes(now, startMinute), startHour),
        TIMEZONE,
      );
      let shiftEnd = zonedTimeToUtc(
        setHours(setMinutes(now, endMinute), endHour),
        TIMEZONE,
      );

      // Handle overnight shift
      if (isBefore(shiftEnd, shiftStart)) {
        if (isBefore(now, shiftStart)) {
          shiftStart = subHours(shiftStart, 24);
        } else {
          shiftEnd = addHours(shiftEnd, 24);
        }
      }

      return { shift, shiftStart, shiftEnd };
    } catch (error) {
      console.error('Error getting effective shift:', error);
      return null;
    }
  }, [userData, attendanceStatus, TIMEZONE]);

  const isOutsideShiftCheck = useCallback(async () => {
    const effectiveShiftData = await getEffectiveShift();
    if (!effectiveShiftData) {
      console.error('No effective shift data found');
      return true;
    }

    const { shiftStart, shiftEnd } = effectiveShiftData;
    const now = zonedTimeToUtc(new Date(), TIMEZONE);

    const flexibleStart = subMinutes(shiftStart, 30);
    const flexibleEnd = addMinutes(shiftEnd, 30);

    // Handle overnight shifts
    if (isBefore(shiftEnd, shiftStart)) {
      if (isAfter(now, flexibleStart) || isBefore(now, flexibleEnd)) {
        return false;
      }
    } else {
      if (isAfter(now, flexibleStart) && isBefore(now, flexibleEnd)) {
        return false;
      }
    }

    return true;
  }, [getEffectiveShift, TIMEZONE]);

  const isCheckInOutAllowed = useCallback(async () => {
    const effectiveShiftData = await getEffectiveShift();
    if (!effectiveShiftData) {
      return {
        allowed: false,
        reason: 'ไม่พบข้อมูลกะการทำงาน กรุณาติดต่อ HR',
        isLate: false,
        isOvertime: false,
      };
    }

    const { shiftStart, shiftEnd } = effectiveShiftData;
    const now = zonedTimeToUtc(new Date(), TIMEZONE);

    // Handle ongoing overtime from previous day
    if (
      attendanceStatus.latestAttendance?.checkInTime &&
      isBefore(
        parseISO(attendanceStatus.latestAttendance.checkInTime),
        startOfDay(now),
      ) &&
      attendanceStatus.latestAttendance.status === 'overtime-started'
    ) {
      return {
        allowed: true,
        reason: 'การทำงานล่วงเวลาต่อเนื่องจากวันก่อน',
        isLate: false,
        isOvertime: true,
      };
    }

    if (attendanceStatus.isDayOff) {
      return {
        allowed: true,
        reason: 'วันหยุด: การทำงานจะถูกบันทึกเป็นการทำงานล่วงเวลา',
        isLate: false,
        isOvertime: true,
      };
    }

    const twoHoursBeforeShift = subHours(shiftStart, 2);
    const lateThreshold = addMinutes(shiftStart, 30);
    const overtimeThreshold = addMinutes(shiftEnd, 5);

    // Handle ongoing overtime from previous day or incomplete overtime records
    if (
      attendanceStatus.latestAttendance?.checkInTime &&
      (isBefore(
        parseISO(attendanceStatus.latestAttendance.checkInTime),
        startOfDay(now),
      ) ||
        attendanceStatus.latestAttendance.status === 'overtime-started') &&
      !attendanceStatus.latestAttendance.checkOutTime
    ) {
      return {
        allowed: true,
        reason: 'การทำงานล่วงเวลาต่อเนื่องหรือยังไม่สมบูรณ์ กรุณาลงเวลาออก',
        isLate: false,
        isOvertime: true,
      };
    }

    if (attendanceStatus.isCheckingIn) {
      if (isBefore(now, twoHoursBeforeShift)) {
        return {
          allowed: false,
          reason: 'ยังไม่ถึงเวลาเข้างาน กรุณารอจนกว่าจะถึงเวลาที่กำหนด',
          isLate: false,
          isOvertime: false,
        };
      }

      if (isAfter(now, lateThreshold)) {
        return {
          allowed: true,
          reason: 'คุณกำลังเข้างานสาย',
          isLate: true,
          isOvertime: false,
        };
      }
    } else {
      if (isBefore(now, shiftEnd)) {
        return {
          allowed: true,
          reason: 'คุณกำลังออกงานก่อนเวลา',
          isLate: false,
          isOvertime: false,
        };
      }

      if (isAfter(now, overtimeThreshold)) {
        return {
          allowed: true,
          reason: 'คุณกำลังทำงานล่วงเวลา',
          isLate: false,
          isOvertime: true,
        };
      }
    }

    return { allowed: true, reason: null, isLate: false, isOvertime: false };
  }, [getEffectiveShift, attendanceStatus, TIMEZONE]);

  const checkInOut = useCallback(async (attendanceData: AttendanceData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/check-in-out', attendanceData);
      setAttendanceStatus((prevStatus) => ({
        ...prevStatus,
        isCheckingIn: !prevStatus.isCheckingIn,
        latestAttendance: response.data,
      }));
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isWithinPremises = useCallback(
    (lat: number, lng: number): Premise | null => {
      for (const premise of PREMISES) {
        const distance = calculateDistance(lat, lng, premise.lat, premise.lng);
        if (distance <= premise.radius) {
          return premise;
        }
      }
      return null;
    },
    [],
  );

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

  const getAddressFromCoordinates = useCallback(
    async (lat: number, lng: number) => {
      const premise = isWithinPremises(lat, lng);
      if (premise) {
        return premise.name;
      }
      try {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`,
        );
        if (response.data.results && response.data.results.length > 0) {
          return response.data.results[0].formatted_address;
        } else {
          throw new Error('No address found');
        }
      } catch (error) {
        console.error('Error fetching address:', error);
        const nearestPremise = isWithinPremises(lat, lng);
        return nearestPremise ? nearestPremise.name : 'Unknown location';
      }
    },
    [isWithinPremises],
  );

  useEffect(() => {
    const getCurrentLocation = async () => {
      if (!navigator.geolocation) {
        setError(
          'Geolocation is not supported by this browser. Using default location.',
        );
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          },
        );

        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLocation(newLocation);

        const fetchedAddress = await getAddressFromCoordinates(
          newLocation.lat,
          newLocation.lng,
        );
        setAddress(fetchedAddress);

        const premise = isWithinPremises(newLocation.lat, newLocation.lng);
        setInPremises(!!premise);
      } catch (error) {
        setError('Unable to get precise location. Using default location.');
      }
    };

    getCurrentLocation();
  }, [getAddressFromCoordinates, isWithinPremises]);

  useEffect(() => {
    const checkOutsideShift = async () => {
      const outsideShift = await isOutsideShiftCheck();
      setIsOutsideShift(outsideShift);
    };

    checkOutsideShift();
  }, [isOutsideShiftCheck]);

  return {
    attendanceStatus,
    isLoading,
    error,
    location,
    address,
    inPremises,
    isOutsideShift,
    checkInOut,
    isCheckInOutAllowed,
    getEffectiveShift,
    isWithinPremises,
    getAddressFromCoordinates,
  };
};
