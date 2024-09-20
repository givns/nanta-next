// check-in-router.tsx

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from '../types/user';
import { AttendanceStatusInfo, ShiftData } from '@/types/attendance';
import axios from 'axios';
import { formatBangkokTime, getBangkokTime } from '../utils/dateUtils';
import SkeletonLoader from '../components/SkeletonLoader';
import { z } from 'zod'; // Import Zod for runtime type checking

const CheckInOutForm = dynamic(() => import('../components/CheckInOutForm'), {
  loading: () => <p>Loading form...</p>,
});
const ErrorBoundary = dynamic(() => import('../components/ErrorBoundary'));

interface CheckInRouterProps {
  lineUserId: string | null;
}

const UserDataSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  lineUserId: z.string().nullable(),
  nickname: z.string().nullable(),
  departmentId: z.string().nullable(),
  departmentName: z.string(),
  role: z.string(),
  profilePictureUrl: z.string().nullable(),
  shiftId: z.string().nullable(),
  shiftCode: z.string().nullable(),
  overtimeHours: z.number(),
  sickLeaveBalance: z.number(),
  businessLeaveBalance: z.number(),
  annualLeaveBalance: z.number(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
});

// Update AttendanceStatusInfoSchema to match your AttendanceStatusInfo type
const AttendanceStatusInfoSchema = z.object({
  status: z.string(),
  isOvertime: z.boolean(),
  overtimeDuration: z.number().nullable(),
  detailedStatus: z.string(),
  isEarlyCheckIn: z.boolean().nullable(),
  isLateCheckIn: z.boolean().nullable(),
  isLateCheckOut: z.boolean().nullable(),
  user: UserDataSchema,
  latestAttendance: z
    .object({
      id: z.string(),
      employeeId: z.string(),
      date: z.string(),
      checkInTime: z.string().nullable(),
      checkOutTime: z.string().nullable(),
      status: z.string(),
      isManualEntry: z.boolean(),
    })
    .nullable(),
  isCheckingIn: z.boolean(),
  isDayOff: z.boolean(),
  potentialOvertimes: z.array(
    z.object({
      // Define the structure of PotentialOvertime
    }),
  ),
  shiftAdjustment: z
    .object({
      // Define the structure of ShiftAdjustment
    })
    .nullable(),
  approvedOvertime: z
    .object({
      // Define the structure of ApprovedOvertime
    })
    .nullable(),
  futureShifts: z.array(
    z.object({
      // Define the structure of future shifts
    }),
  ),
  futureOvertimes: z.array(
    z.object({
      // Define the structure of future overtimes
    }),
  ),
});

// Update ShiftDataSchema to match your Shift model
const ShiftDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workDays: z.array(z.number()),
  shiftCode: z.string(),
});

const CheckInOutAllowanceSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  isLate: z.boolean().optional(),
  isOvertime: z.boolean().optional(),
});

// Update the ResponseDataSchema
const ResponseDataSchema = z.object({
  user: UserDataSchema,
  attendanceStatus: AttendanceStatusInfoSchema,
  effectiveShift: ShiftDataSchema.nullable(),
  checkInOutAllowance: CheckInOutAllowanceSchema,
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

  const fetchData = useCallback(async () => {
    if (!lineUserId) {
      setError('LINE user ID not available');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.get(
        `/api/user-check-in-status?lineUserId=${lineUserId}`,
      );

      // Validate the response data
      const validatedData = ResponseDataSchema.parse(response.data);

      setUserData(validatedData.user as UserData);
      setAttendanceStatus(
        validatedData.attendanceStatus as AttendanceStatusInfo,
      );
      setEffectiveShift(validatedData.effectiveShift as ShiftData | null);
      setCheckInOutAllowance(
        validatedData.checkInOutAllowance as {
          allowed: boolean;
          reason?: string;
          isLate?: boolean;
          isOvertime?: boolean;
        } | null,
      );
    } catch (err) {
      console.error('Error in data fetching:', err);
      if (err instanceof z.ZodError) {
        setError(
          'Data validation error: ' +
            err.errors.map((e) => e.message).join(', '),
        );
      } else if (axios.isAxiosError(err)) {
        setError(
          'Network error: ' + (err.response?.data?.message || err.message),
        );
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId]);

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
        } catch (error) {
          console.error('Error during check-in/out:', error);
          setFormError('Failed to update status. Please try again.');
        }
      }
    },
    [attendanceStatus, fetchData, lineUserId],
  );

  const handleRefresh = useCallback(() => {}, [fetchData]);

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
          <button
            onClick={handleRefresh}
            className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Refresh Data
          </button>
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

export default CheckInRouter;
