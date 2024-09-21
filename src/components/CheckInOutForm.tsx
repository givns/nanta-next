// components/CheckInOutForm.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import Webcam from 'react-webcam';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ShiftData,
} from '../types/attendance';
import { UserData } from '../types/user';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import { useAttendance } from '../hooks/useAttendance';
import dynamic from 'next/dynamic';
import ErrorBoundary from './ErrorBoundary';
import { parseISO, isValid } from 'date-fns';
import { formatTime, formatDate, getBangkokTime } from '../utils/dateUtils';
import liff from '@line/liff';
import { User } from '@sentry/node';

const InteractiveMap = dynamic(() => import('./InteractiveMap'), {
  loading: () => <p>Loading map...</p>,
  ssr: false,
});

interface CheckInOutFormProps {
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  initialCheckInOutAllowance: {
    allowed: boolean;
    reason?: string;
    isLate?: boolean;
    isOvertime?: boolean;
  } | null;
  onStatusChange: (newStatus: boolean) => void;
  onError: () => void; // Add this line
}

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  initialAttendanceStatus,
  effectiveShift,
  initialCheckInOutAllowance,
  onStatusChange,
  onError,
}) => {
  const [step, setStep] = useState<'info' | 'camera' | 'confirm'>('info');
  const [reason, setReason] = useState<string>('');
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [isOvertime, setIsOvertime] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    attendanceStatus,
    isLoading,
    location,
    address,
    inPremises,
    isOutsideShift,
    checkInOut,
    isCheckInOutAllowed,
    refreshAttendanceStatus,
  } = useAttendance(
    userData,
    initialAttendanceStatus,
    initialCheckInOutAllowance ?? { allowed: false },
  );

  const handlePhotoCapture = useCallback(
    async (capturedPhoto: string) => {
      if (!location) {
        console.error('No location data');
        onError();
        return;
      }

      try {
        const {
          allowed,
          reason: checkInOutReason,
          isLate,
          isOvertime,
        } = await isCheckInOutAllowed();

        if (!allowed) {
          console.error(checkInOutReason);
          setError(
            checkInOutReason || 'Check-in/out is not allowed at this time.',
          );
          return;
        }

        if (isLate && attendanceStatus.isCheckingIn) {
          setIsLateModalOpen(true);
          return;
        }

        const checkInOutData: AttendanceData = {
          employeeId: userData.employeeId,
          lineUserId: userData.lineUserId,
          checkTime: new Date().toISOString(),
          location: JSON.stringify(location),
          address,
          reason: '',
          isCheckIn: attendanceStatus.isCheckingIn,
          isOvertime,
          isLate,
        };

        console.log('Data being sent to check-in-out API:', checkInOutData);

        const response = await checkInOut(checkInOutData);
        console.log('Check-in/out response:', response);

        onStatusChange(!attendanceStatus.isCheckingIn);
        await refreshAttendanceStatus();

        // Close LIFF window after successful submission
        try {
          await liff.init({
            liffId: process.env.NEXT_PUBLIC_LIFF_ID as string,
          });
          setTimeout(() => {
            liff.closeWindow();
          }, 2000);
        } catch (error) {
          console.error('Error closing LIFF window:', error);
        }
      } catch (error) {
        console.error('Error in handlePhotoCapture:', error);
        setError('An error occurred. Please try again.');
      }
    },
    [
      location,
      isCheckInOutAllowed,
      attendanceStatus,
      userData,
      address,
      checkInOut,
      onStatusChange,
      refreshAttendanceStatus,
      onError,
    ],
  );

  const {
    webcamRef,
    isModelLoading,
    message: faceDetectionMessage,
  } = useFaceDetection(2, handlePhotoCapture);

  const handleLateReasonSubmit = async (lateReason: string) => {
    setIsLateModalOpen(false);
    await handlePhotoCapture(lateReason);
  };

  useEffect(() => {
    console.log('CheckInOutForm mounted');
    console.log('userData:', userData);
    console.log('initialAttendanceStatus:', initialAttendanceStatus);
    console.log('effectiveShift:', effectiveShift);

    try {
      if (initialAttendanceStatus?.latestAttendance) {
        const { checkInTime, checkOutTime, status } =
          initialAttendanceStatus.latestAttendance;
        console.log('Latest attendance:', {
          checkInTime,
          checkOutTime,
          status,
        });

        if (checkInTime) {
          console.log('Check-in time:', checkInTime);
        } else {
          console.log('No check-in time available');
        }

        if (checkOutTime) {
          console.log('Check-out time:', checkOutTime);
        } else {
          console.log('No check-out time available');
        }
      }

      if (effectiveShift) {
        console.log('Shift start time:', formatTime(effectiveShift.startTime));
        console.log('Shift end time:', formatTime(effectiveShift.endTime));
      }
    } catch (err) {
      console.error('Error in CheckInOutForm:', err);
      setError(
        err instanceof Error ? err.message : 'An unknown error occurred',
      );
    }
  }, [userData, initialAttendanceStatus, effectiveShift]);

  const submitCheckInOut = useCallback(
    async (lateReasonInput?: string) => {
      if (!location) return;

      const checkInOutData: AttendanceData = {
        employeeId: userData.employeeId,
        lineUserId: userData.lineUserId,
        checkTime: new Date().toISOString(),
        location: JSON.stringify(location),
        address,
        reason: lateReasonInput || reason,
        isCheckIn: attendanceStatus.isCheckingIn,
        isOvertime,
        isLate,
      };

      console.log('Data being sent to check-in-out API:', checkInOutData);

      try {
        const response = await checkInOut(checkInOutData);
        console.log('Check-in/out response:', response);

        onStatusChange(!attendanceStatus.isCheckingIn);
        await refreshAttendanceStatus();

        // Close LIFF window after successful submission
        try {
          await liff.init({
            liffId: process.env.NEXT_PUBLIC_LIFF_ID as string,
          });
          setTimeout(() => {
            liff.closeWindow();
          }, 2000); // Close the window after 2 seconds
        } catch (error) {
          console.error('Error closing LIFF window:', error);
        }
      } catch (error) {
        console.error('Error during check-in/out:', error);
        setError('Failed to submit check-in/out. Please try again.');
      }
    },
    [
      location,
      userData,
      attendanceStatus,
      isOvertime,
      isLate,
      reason,
      checkInOut,
      onStatusChange,
      refreshAttendanceStatus,
      address,
    ],
  );

  if (error) {
    return (
      <div
        className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
        role="alert"
      >
        <strong className="font-bold">Error:</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  const renderStep1 = () => (
    <div className="flex flex-col h-full">
      <ErrorBoundary>
        <UserShiftInfo
          userData={userData}
          attendanceStatus={attendanceStatus}
          effectiveShift={effectiveShift}
          isOutsideShift={isOutsideShift}
        />
      </ErrorBoundary>
      <div className="flex-shrink-0 mt-4">
        <button
          onClick={() => setStep('camera')}
          disabled={!initialCheckInOutAllowance?.allowed}
          className={`w-full ${
            initialCheckInOutAllowance?.allowed
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-gray-400 cursor-not-allowed'
          } text-white py-3 px-4 rounded-lg transition duration-300`}
          aria-label={`เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
        >
          {initialCheckInOutAllowance?.allowed
            ? `เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`
            : 'ไม่สามารถลงเวลาได้ในขณะนี้'}
        </button>
        {!initialCheckInOutAllowance?.allowed &&
          initialCheckInOutAllowance?.reason && (
            <p className="text-red-500 text-center text-sm mt-2">
              {initialCheckInOutAllowance.reason}
            </p>
          )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="h-full flex flex-col justify-center">
      {isModelLoading ? (
        <SkeletonLoader />
      ) : (
        <>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="w-full rounded-lg mb-4"
          />
          <p className="text-center mb-2">{faceDetectionMessage}</p>
        </>
      )}
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col">
        <div className="flex-grow overflow-hidden flex flex-col">
          {step === 'info' && renderStep1()}
          {step === 'camera' && renderStep2()}
        </div>
        {error && (
          <div className="mt-4">
            <p className="text-red-500" role="alert">
              {error}
            </p>
          </div>
        )}
        <LateReasonModal
          isOpen={isLateModalOpen}
          onClose={() => setIsLateModalOpen(false)}
          onSubmit={handleLateReasonSubmit}
        />
      </div>
    </ErrorBoundary>
  );
};

export default CheckInOutForm;
