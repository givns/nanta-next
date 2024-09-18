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
}

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  initialAttendanceStatus,
  effectiveShift,
  initialCheckInOutAllowance,
  onStatusChange,
}) => {
  const router = useRouter();
  const [step, setStep] = useState<'info' | 'camera' | 'confirm'>('info');
  const [reason, setReason] = useState<string>('');
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [isOvertime, setIsOvertime] = useState(false);

  const [isCheckInOutAllowedState, setIsCheckInOutAllowedState] = useState({
    allowed: false,
    reason: '',
  });

  const {
    attendanceStatus,
    isLoading,
    error,
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

  const handlePhotoCapture = useCallback((capturedPhoto: string) => {
    setPhoto(capturedPhoto);
    setStep('confirm');
  }, []);

  const {
    webcamRef,
    isModelLoading,
    photo,
    setPhoto,
    message: faceDetectionMessage,
  } = useFaceDetection(5, handlePhotoCapture);

  useEffect(() => {
    const checkAllowed = async () => {
      const { allowed, reason } = await isCheckInOutAllowed();
      setIsCheckInOutAllowedState({ allowed, reason: reason || '' });
    };
    checkAllowed();
  }, [isCheckInOutAllowed]);

  useEffect(() => {
    console.log('CheckInOutForm mounted');
    console.log('userData:', userData);
    console.log('initialAttendanceStatus:', initialAttendanceStatus);
    console.log('effectiveShift:', effectiveShift);

    if (initialAttendanceStatus?.latestAttendance) {
      const { checkInTime, checkOutTime, status } =
        initialAttendanceStatus.latestAttendance;
      console.log('Latest attendance:', { checkInTime, checkOutTime, status });

      if (checkInTime) {
        console.log('Formatted checkInTime:', formatTime(checkInTime));
      } else {
        console.log('No check-in time available');
      }

      if (checkOutTime) {
        console.log('Formatted checkOutTime:', formatTime(checkOutTime));
      } else {
        console.log('No check-out time available');
      }
    }

    if (effectiveShift) {
      console.log('Shift start time:', formatTime(effectiveShift.startTime));
      console.log('Shift end time:', formatTime(effectiveShift.endTime));
    }
  }, [userData, initialAttendanceStatus, effectiveShift]);

  const submitCheckInOut = useCallback(
    async (lateReasonInput?: string) => {
      if (!location) return;

      const checkInOutData = {
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

      try {
        const response = await checkInOut(checkInOutData);
        console.log('Check-in/out response:', response);

        onStatusChange(!attendanceStatus.isCheckingIn);
        await refreshAttendanceStatus();
        router.push('/checkInOutSuccess');
      } catch (error) {
        console.error('Error during check-in/out:', error);
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
      router,
    ],
  );

  const handleCheckInOut = useCallback(async () => {
    if (!location) {
      console.error('No location data');
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
        return;
      }

      setIsLate(isLate || false);
      setIsOvertime(isOvertime || false);

      if (isLate && attendanceStatus.isCheckingIn) {
        setIsLateModalOpen(true);
        return;
      }

      await submitCheckInOut();
    } catch (error) {
      console.error('Error in handleCheckInOut:', error);
    }
  }, [
    location,
    isCheckInOutAllowed,
    attendanceStatus.isCheckingIn,
    submitCheckInOut,
  ]);

  const handleLateReasonSubmit = async (lateReason: string) => {
    setIsLateModalOpen(false);
    await submitCheckInOut(lateReason);
  };

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
      <UserShiftInfo
        userData={userData}
        attendanceStatus={attendanceStatus}
        effectiveShift={effectiveShift}
        isOutsideShift={isOutsideShift}
      />
      <div className="flex-shrink-0 mt-4">
        <button
          onClick={() => setStep('camera')}
          disabled={!isCheckInOutAllowedState.allowed}
          className={`w-full ${
            isCheckInOutAllowedState.allowed
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-gray-400 cursor-not-allowed'
          } text-white py-3 px-4 rounded-lg transition duration-300`}
          aria-label={`เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
        >
          {isCheckInOutAllowedState.allowed
            ? `เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`
            : 'ไม่สามารถลงเวลาได้ในขณะนี้'}
        </button>
        {isCheckInOutAllowedState.reason && (
          <p className="text-red-500 text-center text-sm mt-2">
            {isCheckInOutAllowedState.reason}
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

  const renderStep3 = () => (
    <div className="flex flex-col h-full">
      <div className="bg-white p-6 rounded-box shadow-lg mb-4 flex-grow overflow-y-auto">
        <div className="mb-4">
          <label
            htmlFor="address-display"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            ที่อยู่ของคุณ
          </label>
          <div
            id="address-display"
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5"
            aria-live="polite"
          >
            {address || 'Loading address...'}
          </div>
        </div>
        {location && (
          <div className="mb-4">
            <InteractiveMap
              lat={location.lat}
              lng={location.lng}
              apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API ?? ''}
            />
          </div>
        )}
        {!inPremises && (
          <div className="mt-4">
            <label
              htmlFor="reason-input"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              เหตุผลสำหรับการ
              {attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}นอกสถานที่
            </label>
            <input
              type="text"
              id="reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
              required
            />
          </div>
        )}
      </div>
      <div className="mt-auto">
        <button
          onClick={handleCheckInOut}
          disabled={isLoading || (!inPremises && !reason)}
          className="w-full bg-red-500 text-white py-3 px-4 rounded-lg hover:bg-red-600 transition duration-300 disabled:bg-gray-400"
          aria-label={`ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
        >
          {isLoading
            ? 'กำลังดำเนินการ...'
            : `ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
        </button>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col">
        <div className="flex-grow overflow-hidden flex flex-col">
          {step === 'info' && renderStep1()}
          {step === 'camera' && renderStep2()}
          {step === 'confirm' && renderStep3()}
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
