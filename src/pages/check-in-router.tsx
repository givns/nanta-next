// check-in-router.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import { AttendanceStatusInfo, ShiftData } from '@/types/attendance';
import axios from 'axios';
import { formatBangkokTime, getBangkokTime } from '../utils/dateUtils';
import SkeletonLoader from '../components/SkeletonLoader';
import { z } from 'zod'; // Import Zod for runtime type checking
import { UserRole } from '@/types/enum';
import { debounce } from 'lodash';

const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>Loading form...</p>,
});
const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

interface CheckInRouterProps {
  lineUserId: string | null;
}

const CACHE_KEY = 'attendanceStatus';
const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const CACHE_VERSION = '1'; // Change this value if the cache schema changes

interface CachedData {
  data: {
    userData: UserData;
    attendanceStatus: AttendanceStatusInfo;
    effectiveShift: ShiftData;
    checkInOutAllowance: {
      allowed: boolean;
      reason?: string;
      isLate?: boolean;
      isOvertime?: boolean;
    };
  };
  timestamp: number;
}

const UserDataSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  lineUserId: z.string().nullable(),
  nickname: z.string().nullable(),
  departmentId: z.string().nullable(),
  departmentName: z.string(),
  role: z.nativeEnum(UserRole),
  profilePictureUrl: z.string().nullable(),
  shiftId: z.string().nullable(),
  shiftCode: z.string().nullable(),
  overtimeHours: z.number(),
  potentialOvertimes: z.array(z.any()), // You might want to define a more specific schema for PotentialOvertime
  sickLeaveBalance: z.number(),
  businessLeaveBalance: z.number(),
  annualLeaveBalance: z.number(),
  createdAt: z.string().or(z.date()).optional(),
  updatedAt: z.string().or(z.date()).optional(),
});

const ShiftDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  shiftCode: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workDays: z.array(z.number()),
});

const AttendanceStatusInfoSchema = z.object({
  status: z.enum(['present', 'absent', 'incomplete', 'holiday', 'off']),
  isOvertime: z.boolean(),
  overtimeDuration: z.number().optional(),
  detailedStatus: z.string(),
  isEarlyCheckIn: z.boolean(),
  isLateCheckIn: z.boolean(),
  isLateCheckOut: z.boolean(),
  user: UserDataSchema,
  latestAttendance: z
    .object({
      id: z.string(),
      employeeId: z.string(),
      date: z.string(),
      checkInTime: z.string().nullable(),
      checkOutTime: z.string().nullable(),
      status: z.enum([
        'checked-in',
        'checked-out',
        'overtime-started',
        'overtime-ended',
        'pending',
        'approved',
        'denied',
      ]),
      isManualEntry: z.boolean(),
    })
    .nullable(),
  isCheckingIn: z.boolean(),
  isDayOff: z.boolean(),
  potentialOvertimes: z.array(z.any()), // Define a more specific schema if possible
  shiftAdjustment: z
    .object({
      date: z.string(),
      requestedShiftId: z.string(),
      requestedShift: ShiftDataSchema,
    })
    .nullable(),
  approvedOvertime: z.any().nullable(), // Define a more specific schema if possible
  futureShifts: z.array(
    z.object({
      date: z.string(),
      shift: ShiftDataSchema,
    }),
  ),
  futureOvertimes: z.array(z.any()), // Define a more specific schema if possible
});

const ResponseDataSchema = z.object({
  user: UserDataSchema,
  attendanceStatus: AttendanceStatusInfoSchema,
  effectiveShift: ShiftDataSchema,
  checkInOutAllowance: z.object({
    allowed: z.boolean(),
    reason: z.string().optional(),
    isLate: z.boolean().optional(),
    isOvertime: z.boolean().optional(),
  }),
});

const CheckInRouter: React.FC<CheckInRouterProps> = ({ lineUserId }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatusInfo | null>(null);
  const [effectiveShift, setEffectiveShift] = useState<ShiftData | null>(null);
  const [checkInOutAllowance, setCheckInOutAllowance] = useState<{
    allowed: boolean;
    reason?: string;
    isLate?: boolean;
    isOvertime?: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(
    getBangkokTime().toLocaleTimeString(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isCachedData, setIsCachedData] = useState(false);

  const getCachedData = useCallback((): CachedData | null => {
    const cachedString = localStorage.getItem(CACHE_KEY);
    if (!cachedString) return null;
    const parsed = JSON.parse(cachedString);
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed.data;
  }, []);

  const setCachedData = useCallback((data: CachedData['data']) => {
    const cacheData = {
      version: CACHE_VERSION,
      data: {
        data,
        timestamp: Date.now(),
      },
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  }, []);

  const isCacheValid = useCallback((cachedData: CachedData): boolean => {
    return Date.now() - cachedData.timestamp < CACHE_EXPIRATION;
  }, []);

  const invalidateCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setIsCachedData(false);
    console.log('Cache invalidated');
  }, []);

  const fetchData = useCallback(async () => {
    if (!lineUserId) {
      setError('LINE user ID not available');
      setIsLoading(false);
      return;
    }

    try {
      const cachedData = getCachedData();
      if (cachedData && isCacheValid(cachedData)) {
        console.log('Cache hit');
        const validatedCachedData = ResponseDataSchema.safeParse(
          cachedData.data,
        );
        if (validatedCachedData.success) {
          setUserData(parseUserData(validatedCachedData.data.user));
          setAttendanceStatus(
            parseAttendanceStatus(validatedCachedData.data.attendanceStatus),
          );
          setEffectiveShift(validatedCachedData.data.effectiveShift);
          setCheckInOutAllowance(validatedCachedData.data.checkInOutAllowance);
          setIsLoading(false);
          setIsCachedData(true);
          return;
        } else {
          console.error(
            'Cached data validation failed:',
            validatedCachedData.error,
          );
          invalidateCache();
        }
      }

      console.log('Cache miss');
      const response = await axios.get(
        `/api/user-check-in-status?lineUserId=${lineUserId}`,
      );
      const validatedData = ResponseDataSchema.parse(response.data);

      const userData = parseUserData(validatedData.user);
      const attendanceStatus = parseAttendanceStatus(
        validatedData.attendanceStatus,
      );

      setUserData(userData);
      setAttendanceStatus(attendanceStatus);
      setEffectiveShift(validatedData.effectiveShift);
      setCheckInOutAllowance(validatedData.checkInOutAllowance);

      setCachedData({
        userData,
        attendanceStatus,
        effectiveShift: validatedData.effectiveShift,
        checkInOutAllowance: validatedData.checkInOutAllowance,
      });
      setIsCachedData(false);
    } catch (err) {
      console.error('Error in data fetching:', err);
      if (err instanceof z.ZodError) {
        setError(
          `Data validation error: ${err.errors.map((e) => e.message).join(', ')}`,
        );
      } else {
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred',
        );
      }
      invalidateCache();
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId, getCachedData, isCacheValid, setCachedData, invalidateCache]);

  const debouncedFetchData = useMemo(
    () => debounce(fetchData, 300),
    [fetchData],
  );

  useEffect(() => {
    debouncedFetchData();
    return () => debouncedFetchData.cancel();
  }, [debouncedFetchData]);

  // Helper functions to parse dates
  const parseDate = (
    dateString: string | null | undefined,
  ): Date | undefined => {
    if (!dateString) return undefined;
    const parsed = new Date(dateString);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  };

  const parseUserData = (userData: any): UserData => ({
    ...userData,
    createdAt: parseDate(userData.createdAt),
    updatedAt: parseDate(userData.updatedAt),
  });

  const parseAttendanceStatus = (status: any): AttendanceStatusInfo => ({
    ...status,
    user: parseUserData(status.user),
    latestAttendance: status.latestAttendance
      ? {
          ...status.latestAttendance,
          date: parseDate(status.latestAttendance.date)?.toISOString() ?? '',
        }
      : null,
  });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const updateTime = () => {
      try {
        setCurrentTime(getBangkokTime().toLocaleTimeString());
      } catch (err) {
        console.error('Error updating time:', err);
      }
    };

    updateTime();
    const intervalId = setInterval(updateTime, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleStatusChange = useCallback(
    async (newStatus: boolean) => {
      if (attendanceStatus) {
        try {
          const response = await axios.post('/api/check-in-out', {
            lineUserId,
            isCheckIn: newStatus,
          });

          const updatedStatus = response.data;
          setAttendanceStatus(updatedStatus);
          debouncedFetchData();
        } catch (error) {
          console.error('Error during check-in/out:', error);
          setFormError('Failed to update status. Please try again.');
        }
      }
    },
    [attendanceStatus, lineUserId, debouncedFetchData],
  );

  const handleRefresh = useCallback(() => {
    debouncedFetchData();
  }, [debouncedFetchData]);

  if (isLoading) {
    return <SkeletonLoader />;
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">เกิดข้อผิดพลาด</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!userData || !attendanceStatus || !effectiveShift) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">
          ไม่พบข้อมูลผู้ใช้หรือข้อมูลกะงาน
        </h1>
        <pre>
          {JSON.stringify(
            { userData, attendanceStatus, effectiveShift },
            null,
            2,
          )}
        </pre>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
        <div className="flex-grow flex flex-col justify-start items-center">
          <h1 className="text-2xl font-bold text-center mt-8 mb-2 text-gray-800">
            {attendanceStatus.isCheckingIn
              ? 'ระบบบันทึกเวลาเข้างาน'
              : 'ระบบบันทึกเวลาออกงาน'}
          </h1>
          <div className="text-3xl font-bold text-center mb-2 text-black-950">
            {currentTime}
          </div>
          {isCachedData && (
            <div className="text-sm text-gray-500 text-center mb-2">
              Viewing cached data.{' '}
              <button
                onClick={handleRefresh}
                className="text-blue-500 underline"
              >
                Refresh
              </button>
            </div>
          )}
          {formError && (
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
              role="alert"
            >
              <strong className="font-bold">Error in CheckInOutForm:</strong>
              <span className="block sm:inline"> {formError}</span>
            </div>
          )}
          <ErrorBoundary
            onError={(error: Error) => {
              console.error('Error in CheckInOutForm:', error);
              setFormError(error.message);
            }}
          >
            <div className="w-full max-w-md">
              <CheckInOutForm
                userData={userData}
                initialAttendanceStatus={attendanceStatus}
                effectiveShift={effectiveShift}
                initialCheckInOutAllowance={checkInOutAllowance}
                onStatusChange={handleStatusChange}
                onError={() => fetchData()}
              />
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
