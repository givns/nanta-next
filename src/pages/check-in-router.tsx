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
import { AttendanceStatusInfo, ShiftData } from '@/types/attendance';
import axios from 'axios';
import { formatBangkokTime, getBangkokTime } from '../utils/dateUtils';
import SkeletonLoader from '../components/SkeletonLoader';
import { z } from 'zod'; // Import Zod for runtime type checking
import { UserRole } from '@/types/enum';
import { debounce } from 'lodash';

const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>ระบบกำลังตรวจสอบข้อมูลผู้ใช้งาน...</p>,
});
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
  createdAt: z.date().optional(),
  updatedAt: z
    .union([z.string(), z.date()])
    .transform((val) => (val ? new Date(val) : undefined))
    .optional(),
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

const BasicUserDataSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
});

const BasicAttendanceStatusSchema = z.object({
  isCheckingIn: z.boolean(),
  detailedStatus: z.string(),
});

const BasicDataSchema = z.object({
  user: BasicUserDataSchema,
  attendanceStatus: BasicAttendanceStatusSchema,
});

const CheckInRouter: React.FC<CheckInRouterProps> = ({ lineUserId }) => {
  const [basicData, setBasicData] = useState<z.infer<
    typeof BasicDataSchema
  > | null>(null);
  const [fullData, setFullData] = useState<z.infer<
    typeof ResponseDataSchema
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(
    getBangkokTime().toLocaleTimeString(),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isCachedData, setIsCachedData] = useState(false);

  const getCachedData = useCallback(() => {
    const cachedString = localStorage.getItem(CACHE_KEY);
    if (!cachedString) return null;
    try {
      const parsed = JSON.parse(cachedString);
      if (parsed.version !== CACHE_VERSION) return null;
      return parsed.data;
    } catch (e) {
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

  const fetchBasicData = useCallback(async () => {
    if (!lineUserId) {
      setError('LINE user ID not available');
      setIsLoading(false);
      return;
    }

    try {
      const cachedData = getCachedData();
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_EXPIRATION) {
        const validatedBasicData = BasicDataSchema.safeParse(cachedData);
        if (validatedBasicData.success) {
          setBasicData(validatedBasicData.data);
          setIsLoading(false);
          setIsCachedData(true);
          return;
        }
      }

      const response = await axios.get(
        `/api/user-basic-info?lineUserId=${lineUserId}`,
      );
      const validatedData = BasicDataSchema.parse(response.data);
      setBasicData(validatedData);
      setCachedData(validatedData);
      setIsCachedData(false);
    } catch (err) {
      console.error('Error fetching basic data:', err);
      setError('Failed to load basic user information');
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId, getCachedData, setCachedData]);

  const fetchFullData = useCallback(async () => {
    if (!lineUserId) return;

    try {
      const response = await axios.get(
        `/api/user-check-in-status?lineUserId=${lineUserId}`,
      );
      const validatedData = ResponseDataSchema.parse(response.data);

      const parsedData = {
        ...validatedData,
        user: {
          ...validatedData.user,
          createdAt: validatedData.user.createdAt
            ? new Date(validatedData.user.createdAt)
            : undefined,
          updatedAt: validatedData.user.updatedAt
            ? new Date(validatedData.user.updatedAt)
            : undefined,
        },
        attendanceStatus: {
          ...validatedData.attendanceStatus,
          user: {
            ...validatedData.attendanceStatus.user,
            createdAt: validatedData.attendanceStatus.user.createdAt
              ? new Date(validatedData.attendanceStatus.user.createdAt)
              : undefined,
            updatedAt: validatedData.attendanceStatus.user.updatedAt
              ? new Date(validatedData.attendanceStatus.user.updatedAt)
              : undefined,
          },
          approvedOvertime:
            validatedData.attendanceStatus.approvedOvertime || null,
          futureShifts: validatedData.attendanceStatus.futureShifts || [],
          futureOvertimes: validatedData.attendanceStatus.futureOvertimes || [],
        },
      };

      setFullData(parsedData);
      setCachedData(parsedData);
      setIsCachedData(false);
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
    }
  }, [lineUserId, setCachedData]);

  const debouncedFetchFullData = useMemo(
    () => debounce(fetchFullData, 300),
    [fetchFullData],
  );

  useEffect(() => {
    fetchBasicData();
  }, [fetchBasicData]);

  useEffect(() => {
    if (basicData) {
      debouncedFetchFullData();
    }
    return () => debouncedFetchFullData.cancel();
  }, [basicData, debouncedFetchFullData]);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(getBangkokTime().toLocaleTimeString());
    };

    updateTime();
    const intervalId = setInterval(updateTime, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleStatusChange = useCallback(
    async (newStatus: boolean) => {
      if (fullData) {
        try {
          const response = await axios.post('/api/check-in-out', {
            lineUserId,
            isCheckIn: newStatus,
          });

          setFullData((prevData) => ({
            ...prevData!,
            attendanceStatus: {
              ...prevData!.attendanceStatus,
              isCheckingIn: !prevData!.attendanceStatus.isCheckingIn,
            },
          }));
          debouncedFetchFullData();
        } catch (error) {
          console.error('Error during check-in/out:', error);
          setFormError('Failed to update status. Please try again.');
        }
      }
    },
    [fullData, lineUserId, debouncedFetchFullData],
  );

  const handleRefresh = useCallback(() => {
    debouncedFetchFullData();
  }, [debouncedFetchFullData]);

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

  if (!basicData) {
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
            {basicData.attendanceStatus.isCheckingIn
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
          <Suspense fallback={<p>Loading additional information...</p>}>
            {fullData && (
              <ErrorBoundary
                onError={(error: Error) => {
                  console.error('Error in CheckInOutForm:', error);
                  setFormError(error.message);
                }}
              >
                <div className="w-full max-w-md">
                  <CheckInOutForm
                    userData={fullData.user}
                    initialAttendanceStatus={fullData.attendanceStatus}
                    effectiveShift={fullData.effectiveShift}
                    initialCheckInOutAllowance={fullData.checkInOutAllowance}
                    onStatusChange={handleStatusChange}
                    onError={() => debouncedFetchFullData()}
                  />
                </div>
              </ErrorBoundary>
            )}
          </Suspense>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInRouter);
