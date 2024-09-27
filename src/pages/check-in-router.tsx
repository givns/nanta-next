// check-in-router.tsx

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
} from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import axios from 'axios';
import SkeletonLoader from '../components/SkeletonLoader';
import { z } from 'zod'; // Import Zod for runtime type checking
import { UserRole } from '@/types/enum';
import { debounce } from 'lodash';
import Clock from '../components/Clock';

const MemoizedCheckInOutForm = React.memo(
  dynamic(() => import('../components/CheckInOutForm'), {
    loading: () => <p>ระบบกำลังตรวจสอบข้อมูลผู้ใช้งาน...</p>,
  }),
);

const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

const CACHE_KEY = 'attendanceStatus';
const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const CACHE_VERSION = '2'; // Change this value if the cache schema changes

interface CheckInRouterProps {
  lineUserId: string | null;
}

const parseUserData = (userData: z.infer<typeof UserDataSchema>): UserData => ({
  ...userData,
  createdAt: userData.createdAt ? new Date(userData.createdAt) : undefined,
  updatedAt: userData.updatedAt ? new Date(userData.updatedAt) : undefined,
});

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
  createdAt: z.string().or(z.date()).nullable().optional(),
  updatedAt: z.string().or(z.date()).nullable().optional(),
});

const ShiftDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  shiftCode: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workDays: z.array(z.number()),
});

const AttendanceStatusInfoSchema = z
  .object({
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
    approvedOvertime: z.any().nullable(),
    futureShifts: z.array(
      z.object({
        date: z.string(),
        shift: ShiftDataSchema,
      }),
    ),
    futureOvertimes: z.array(z.any()), // You might want to define a more specific schema for ApprovedOvertime
  })
  .transform((data) => ({
    ...data,
    user: parseUserData(data.user),
    approvedOvertime: data.approvedOvertime || null,
  }));

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
  const [fullData, setFullData] = useState<z.infer<
    typeof ResponseDataSchema
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCachedData, setIsCachedData] = useState(false);

  const invalidateCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
  }, []);

  // Updated: Modified getCachedData with timing and logging
  const getCachedData = useCallback(() => {
    console.time('Cache retrieval');
    const cachedString = localStorage.getItem(CACHE_KEY);
    if (!cachedString) {
      console.timeEnd('Cache retrieval');
      console.log('No cached data found');
      return null;
    }
    try {
      const parsed = JSON.parse(cachedString);
      if (parsed.version !== CACHE_VERSION) {
        console.timeEnd('Cache retrieval');
        console.log('Cached data version mismatch');
        return null;
      }
      console.timeEnd('Cache retrieval');
      console.log('Retrieved cached data', parsed.data);
      return parsed.data;
    } catch (e) {
      console.timeEnd('Cache retrieval');
      console.error('Error parsing cached data:', e);
      return null;
    }
  }, []);

  const setCachedData = useCallback((data: any) => {
    const cacheData = {
      version: CACHE_VERSION,
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  }, []);

  const fetchFreshData = useCallback(async () => {
    if (!lineUserId) return;

    try {
      // Get current position
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 0,
            enableHighAccuracy: true,
          });
        },
      );

      const { latitude, longitude } = position.coords;

      console.log(`Sending location: lat ${latitude}, lng ${longitude}`);

      const response = await axios.get(`/api/user-check-in-status`, {
        params: {
          lineUserId,
          lat: latitude,
          lng: longitude,
        },
      });
      const validatedData = ResponseDataSchema.parse(response.data);

      const parsedData = {
        ...validatedData,
        user: parseUserData(validatedData.user),
        attendanceStatus: {
          ...validatedData.attendanceStatus,
          user: parseUserData(validatedData.attendanceStatus.user),
          approvedOvertime:
            validatedData.attendanceStatus.approvedOvertime || null,
          futureShifts: validatedData.attendanceStatus.futureShifts || [],
          futureOvertimes: validatedData.attendanceStatus.futureOvertimes || [],
        },
      };

      setFullData(parsedData);
      setCachedData(parsedData);
      setIsCachedData(false);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching full data:', err);
      if (err instanceof z.ZodError) {
        setError(
          `Data validation error: ${err.errors.map((e) => e.message).join(', ')}`,
        );
      } else {
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred',
        );
      }
      setIsLoading(false);
    }
  }, [lineUserId, setCachedData]);

  const staleWhileRevalidate = useCallback(async () => {
    setIsLoading(true);
    const cachedData = getCachedData();
    if (cachedData) {
      setFullData(cachedData);
      setIsCachedData(true);
      setIsLoading(false);
    }
    await fetchFreshData();
  }, [
    getCachedData,
    fetchFreshData,
    setFullData,
    setIsCachedData,
    setIsLoading,
  ]);

  useEffect(() => {
    if (lineUserId) {
      staleWhileRevalidate();
    }
  }, [lineUserId, staleWhileRevalidate]);

  const debouncedFetchFreshData = useMemo(
    () => debounce(fetchFreshData, 300),
    [fetchFreshData],
  );

  const handleStatusChange = useCallback(
    async (newStatus: boolean) => {
      if (fullData) {
        try {
          // Get current position
          const position = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject);
            },
          );

          const { latitude, longitude } = position.coords;

          console.log(
            `Sending location for check-in/out: lat ${latitude}, lng ${longitude}`,
          );

          await axios.post('/api/check-in-out', {
            lineUserId,
            isCheckIn: newStatus,
            lat: latitude,
            lng: longitude,
          });

          setFullData((prevData) => ({
            ...prevData!,
            attendanceStatus: {
              ...prevData!.attendanceStatus,
              isCheckingIn: !prevData!.attendanceStatus.isCheckingIn,
            },
          }));
          invalidateCache();
          debouncedFetchFreshData();
        } catch (error) {
          console.error('Error during check-in/out:', error);
          setFormError('Failed to update status. Please try again.');
        }
      }
    },
    [fullData, lineUserId, debouncedFetchFreshData, invalidateCache],
  );

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

  if (!fullData) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-1xl mb-6 text-gray-800">ไม่พบข้อมูลผู้ใช้</h1>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
        <div className="flex-grow flex flex-col justify-start items-center">
          <h1 className="text-2xl font-bold text-center mt-8 mb-2 text-gray-800">
            {fullData.attendanceStatus.isCheckingIn
              ? 'ระบบบันทึกเวลาเข้างาน'
              : 'ระบบบันทึกเวลาออกงาน'}
          </h1>
          <Clock />
          {isCachedData && (
            <div className="text-sm text-gray-500 text-center mb-2">
              Viewing cached data.{' '}
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
          <Suspense fallback={<p>Loading additional information...</p>}>
            <ErrorBoundary
              onError={(error: Error) => {
                console.error('Error in CheckInOutForm:', error);
                setFormError(error.message);
              }}
            >
              <div className="w-full max-w-md">
                <MemoizedCheckInOutForm
                  userData={{
                    ...fullData.user,
                    createdAt: fullData.user.createdAt
                      ? new Date(fullData.user.createdAt)
                      : undefined,
                    updatedAt: fullData.user.updatedAt
                      ? new Date(fullData.user.updatedAt)
                      : undefined,
                  }}
                  initialAttendanceStatus={fullData.attendanceStatus}
                  effectiveShift={fullData.effectiveShift}
                  initialCheckInOutAllowance={fullData.checkInOutAllowance}
                  onStatusChange={handleStatusChange}
                  onError={() => debouncedFetchFreshData()}
                />
              </div>
            </ErrorBoundary>
          </Suspense>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
