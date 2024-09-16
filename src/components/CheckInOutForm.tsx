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
import InteractiveMap from './InteractiveMap';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import { useAttendance } from '../hooks/useAttendance';
import { formatISO } from 'date-fns';
import { zonedTimeToUtc } from '../utils/dateUtils';

const TIMEZONE = 'Asia/Bangkok';

interface CheckInOutFormProps {
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;

  onStatusChange: (newStatus: boolean) => void;
}

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  initialAttendanceStatus,
  effectiveShift,
  onStatusChange,
}) => {
  const router = useRouter();
  const [step, setStep] = useState<'info' | 'camera' | 'confirm'>('info');
  const [reason, setReason] = useState<string>('');
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [isOvertime, setIsOvertime] = useState(false);

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
  } = useAttendance(userData, initialAttendanceStatus);

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

  const handleCheckInOut = async () => {
    if (!photo || !location) {
      console.error('No photo or location data');
      return;
    }

    const {
      allowed,
      reason: checkInOutReason,
      isLate: late,
      isOvertime: overtime,
    } = await isCheckInOutAllowed();

    if (!allowed) {
      console.error(checkInOutReason);
      return;
    }

    setIsLate(late);
    setIsOvertime(overtime);

    if (late && attendanceStatus.isCheckingIn) {
      setIsLateModalOpen(true);
      return;
    }

    await submitCheckInOut();
  };

  const submitCheckInOut = async (lateReasonInput?: string) => {
    if (!photo || !location) return;

    const checkInOutData: AttendanceData = {
      employeeId: userData.employeeId,
      lineUserId: userData.lineUserId,
      checkTime: formatISO(zonedTimeToUtc(new Date(), TIMEZONE)),
      location: JSON.stringify(location),
      address,
      reason: lateReasonInput || reason,
      photo,
      isCheckIn: attendanceStatus.isCheckingIn,
      isOvertime,
      isLate,
    };

    try {
      const response = await checkInOut(checkInOutData);
      onStatusChange(!attendanceStatus.isCheckingIn);
      router.push('/checkInOutSuccess');
    } catch (error) {
      console.error('Error during check-in/out:', error);
    }
  };

  const handleLateReasonSubmit = async (lateReason: string) => {
    setIsLateModalOpen(false);
    await submitCheckInOut(lateReason);
  };

  const renderStep1 = async () => (
    <div className="flex flex-col h-full">
      <UserShiftInfo
        userData={userData}
        attendanceStatus={attendanceStatus}
        isOutsideShift={isOutsideShift}
      />
      <div className="flex-shrink-0 mt-4">
        <button
          onClick={() => setStep('camera')}
          disabled={!(await isCheckInOutAllowed()).allowed}
          className={`w-full ${
            (await isCheckInOutAllowed()).allowed
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-gray-400 cursor-not-allowed'
          } text-white py-3 px-4 rounded-lg transition duration-300`}
          aria-label={`เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
        >
          {(await isCheckInOutAllowed()).allowed
            ? `เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`
            : 'ไม่สามารถลงเวลาได้ในขณะนี้'}
        </button>
        {(await isCheckInOutAllowed()).reason && (
          <p className="text-red-500 text-center text-sm mt-2">
            {(await isCheckInOutAllowed()).reason}
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
  );
};

export default CheckInOutForm;
