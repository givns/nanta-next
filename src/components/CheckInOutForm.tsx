// components/CheckInOutForm.tsx

import React, { useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ShiftData,
  CheckInOutAllowance,
} from '../types/attendance';
import { UserData } from '../types/user';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import { useAttendance } from '../hooks/useAttendance';
import ErrorBoundary from './ErrorBoundary';
import { formatTime, getBangkokTime } from '../utils/dateUtils';
import liff from '@line/liff';
import { parseISO } from 'date-fns';

interface CheckInOutFormProps {
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  initialCheckInOutAllowance: CheckInOutAllowance;
  onStatusChange: (newStatus: boolean) => void;
  onError: () => void;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [buttonState, setButtonState] = useState(initialCheckInOutAllowance);

  const {
    attendanceStatus,
    location,
    address,
    isOutsideShift,
    checkInOut,
    isCheckInOutAllowed,
    refreshAttendanceStatus,
    checkInOutAllowance,
  } = useAttendance(
    userData,
    initialAttendanceStatus,
    initialCheckInOutAllowance,
  );

  const closeLiffWindow = async () => {
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
  };

  const submitCheckInOut = useCallback(
    async (lateReasonInput?: string) => {
      if (!location) return;

      const checkInOutData: AttendanceData = {
        employeeId: userData.employeeId,
        lineUserId: userData.lineUserId,
        checkTime: getBangkokTime(),
        [attendanceStatus.isCheckingIn ? 'checkInAddress' : 'checkOutAddress']:
          address,
        reason: lateReasonInput || reason,
        isCheckIn: attendanceStatus.isCheckingIn,
      };
      if (isOvertime) {
        checkInOutData.isOvertime = true;
      }
      if (isLate) {
        checkInOutData.isLate = true;
      }

      console.log('Data being sent to check-in-out API:', checkInOutData);

      try {
        console.log('UserData in CheckInOutForm:', userData);
        console.log('CheckInOutData being sent:', checkInOutData);
        const response = await checkInOut(checkInOutData);
        console.log('Check-in/out response:', response);

        onStatusChange(!attendanceStatus.isCheckingIn);
        await refreshAttendanceStatus();

        await closeLiffWindow();
      } catch (error: any) {
        console.error('Error during check-in/out:', error);

        // Check if the error is due to a timeout or network issue
        if (
          error.message.includes('timeout') ||
          error.message.includes('network')
        ) {
          console.log(
            'Possible timeout or network error. Checking attendance status...',
          );
          const latestStatus = await refreshAttendanceStatus();

          // If the attendance was actually recorded despite the error
          if (
            latestStatus.latestAttendance &&
            new Date(
              latestStatus.latestAttendance.checkInTime ||
                latestStatus.latestAttendance.checkOutTime,
            ) > new Date(checkInOutData.checkTime)
          ) {
            console.log(
              'Attendance was recorded successfully despite the error',
            );
            onStatusChange(!attendanceStatus.isCheckingIn);
            await closeLiffWindow();
            return;
          }
        }

        setError('Failed to submit check-in/out. Please try again.');
      }
    },
    [
      location,
      userData,
      attendanceStatus,
      address,
      isOvertime,
      isLate,
      reason,
      checkInOut,
      onStatusChange,
      refreshAttendanceStatus,
      closeLiffWindow,
    ],
  );

  const handlePhotoCapture = useCallback(async () => {
    console.log('Photo capture started');
    if (!location) {
      console.error('No location data');
      onError();
      return;
    }
    if (isSubmitting) return; // Add this line
    setIsSubmitting(true);

    try {
      console.log('Checking if check-in/out is allowed');
      const {
        allowed,
        reason: checkInOutReason,
        isLate,
        isOvertime,
      } = await isCheckInOutAllowed();

      console.log('Check-in/out allowance result:', {
        allowed,
        isLate,
        isOvertime,
      });

      if (!allowed) {
        console.error(checkInOutReason);
        setError(
          checkInOutReason || 'Check-in/out is not allowed at this time.',
        );
        return;
      }

      setIsLate(isLate || false);
      setIsOvertime(isOvertime || false);

      if (isLate && attendanceStatus.isCheckingIn) {
        setIsLateModalOpen(true);
        setReason('');
        return;
      }
      setIsSubmitting(false); // Add this at the end of the function

      console.log('Submitting check-in/out');
      await submitCheckInOut();
      console.log('Check-in/out submitted successfully');
    } catch (error) {
      console.error('Error in handlePhotoCapture:', error);
      setError('An error occurred. Please try again.');
    }
  }, [
    location,
    isCheckInOutAllowed,
    attendanceStatus.isCheckingIn,
    submitCheckInOut,
    onError,
    isSubmitting,
  ]);

  const {
    webcamRef,
    isModelLoading,
    message: faceDetectionMessage,
  } = useFaceDetection(2, handlePhotoCapture);

  const handleLateReasonSubmit = async (lateReason: string) => {
    setIsLateModalOpen(false);
    await submitCheckInOut(lateReason);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setButtonState(checkInOutAllowance || { allowed: false });
    }, 500);

    return () => clearTimeout(timer);
  }, [checkInOutAllowance]);

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
      <div className="flex-shrink-0 mt-4">{renderActionButton()}</div>
    </div>
  );

  const renderActionButton = () => {
    const buttonClass = `w-full ${
      buttonState?.allowed
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-gray-400 cursor-not-allowed'
    } text-white py-3 px-4 rounded-lg transition duration-300`;

    let buttonText = 'ไม่สามารถลงเวลาได้ในขณะนี้';
    if (buttonState?.allowed) {
      buttonText = `เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
    }

    return (
      <>
        <button
          onClick={() =>
            handleAction(attendanceStatus.isCheckingIn ? 'checkIn' : 'checkOut')
          }
          disabled={!buttonState?.allowed}
          className={buttonClass}
          aria-label={buttonText}
        >
          {buttonText}
        </button>
        {!buttonState?.allowed && buttonState?.reason && (
          <p className="text-red-500 text-center text-sm mt-2">
            {buttonState.reason}
          </p>
        )}
        {buttonState?.countdown !== undefined && (
          <p className="text-blue-500 text-center text-sm mt-2">
            สามารถลงเวลาได้ในอีก {buttonState.countdown} นาที
          </p>
        )}
      </>
    );
  };

  const handleAction = (action: 'checkIn' | 'checkOut') => {
    if (action === 'checkOut' && !confirmEarlyCheckOut()) {
      return;
    }
    setStep('camera');
  };

  const confirmEarlyCheckOut = () => {
    if (!effectiveShift) return true;

    const now = getBangkokTime();
    const shiftEnd = parseISO(effectiveShift.endTime);
    if (now < shiftEnd) {
      const confirmed = window.confirm(
        'คุณกำลังจะลงเวลาออกก่อนเวลาเลิกงาน หากคุณต้องการลาป่วยฉุกเฉิน กรุณายื่นคำขอลาในระบบ คุณต้องการลงเวลาออกหรือไม่?',
      );
      if (confirmed) {
        // Redirect to leave request page
        window.location.href = '/leave-request';
        return false;
      }
    }
    return true;
  };

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
