import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Webcam from 'react-webcam';
import '@tensorflow/tfjs-backend-webgl';
import { AttendanceStatus, UserData, ShiftData } from '../types/user';
import axios from 'axios';
import InteractiveMap from './InteractiveMap';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import moment from 'moment-timezone';
import LateReasonModal from './LateReasonModal';

const TIMEZONE = 'Asia/Bangkok';

interface CheckInOutFormProps {
  userData: UserData;
  initialAttendanceStatus: AttendanceStatus;
  onStatusChange: (newStatus: boolean) => void;
}

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

const GOOGLE_MAPS_API = process.env.GOOGLE_MAPS_API;
const shiftManagementService = new ShiftManagementService();

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  initialAttendanceStatus,
  onStatusChange,
}) => {
  console.log('Rendering CheckInOutForm', {
    userData,
    initialAttendanceStatus,
  });
  const router = useRouter();
  const [attendanceStatus, setAttendanceStatus] = useState(
    initialAttendanceStatus,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [address, setAddress] = useState<string>('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [inPremises, setInPremises] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [step, setStep] = useState<'info' | 'camera' | 'confirm'>('info');
  const [isShiftAdjustmentNeeded, setIsShiftAdjustmentNeeded] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [isLate, setIsLate] = useState(false);
  const [lateReason, setLateReason] = useState('');
  const [isOvertime, setIsOvertime] = useState(false);
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOutsideShiftState, setIsOutsideShiftState] = useState(false);
  const [checkInOutAllowedState, setCheckInOutAllowedState] = useState<{
    allowed: boolean;
    reason: string | null;
    isLate: boolean;
    isOvertime: boolean;
  }>({ allowed: false, reason: null, isLate: false, isOvertime: false });

  const handlePhotoCapture = useCallback((capturedPhoto: string) => {
    setPhoto(capturedPhoto);
    setStep('confirm');
  }, []);

  const { webcamRef, isModelLoading, photo, setPhoto, message } =
    useFaceDetection(5, handlePhotoCapture);

  const getEffectiveShift = useCallback(async () => {
    try {
      const now = moment().tz(TIMEZONE);
      const yesterday = moment(now).subtract(1, 'day');
      console.log('Current date:', now.format());
      console.log('User data:', userData);
      console.log('Attendance status:', attendanceStatus);

      // Check for shift adjustment
      const shiftAdjustment =
        attendanceStatus.shiftAdjustment ||
        attendanceStatus.futureShifts.find(
          (adj) =>
            moment(adj.date).isSame(now, 'day') ||
            moment(adj.date).isSame(yesterday, 'day'),
        );

      let shift: ShiftData;
      if (shiftAdjustment) {
        // Type guard to check the structure of shiftAdjustment
        if (
          'requestedShift' in shiftAdjustment &&
          shiftAdjustment.requestedShift
        ) {
          shift = shiftAdjustment.requestedShift as ShiftData;
        } else if ('shift' in shiftAdjustment && shiftAdjustment.shift) {
          shift = shiftAdjustment.shift as ShiftData;
        } else {
          console.error(
            'Unexpected shiftAdjustment structure:',
            shiftAdjustment,
          );
          shift = userData.assignedShift!;
        }
      } else {
        shift = userData.assignedShift!;
      }

      if (!shift) {
        console.error('No shift data found');
        return null;
      }

      console.log('Using shift:', shift);

      const [startHour, startMinute] = shift.startTime.split(':').map(Number);
      const [endHour, endMinute] = shift.endTime.split(':').map(Number);

      let shiftStart = moment(now).set({
        hour: startHour,
        minute: startMinute,
        second: 0,
        millisecond: 0,
      });

      let shiftEnd = moment(now).set({
        hour: endHour,
        minute: endMinute,
        second: 0,
        millisecond: 0,
      });

      // Handle overnight shift
      if (shiftEnd.isBefore(shiftStart)) {
        if (now.isBefore(shiftStart)) {
          shiftStart.subtract(1, 'day');
        } else {
          shiftEnd.add(1, 'day');
        }
      }

      return { shift, shiftStart, shiftEnd };
    } catch (error) {
      console.error('Error getting effective shift:', error);
      return null;
    }
  }, [userData, attendanceStatus, TIMEZONE]);

  const isOutsideShift = useCallback(async () => {
    const effectiveShiftData = await getEffectiveShift();
    if (!effectiveShiftData) {
      console.error('No effective shift data found');
      return true;
    }

    const { shiftStart, shiftEnd } = effectiveShiftData;
    const now = moment().tz(TIMEZONE);

    const flexibleStart = shiftStart.clone().subtract(30, 'minutes');
    const flexibleEnd = shiftEnd.clone().add(30, 'minutes');

    console.log('Now:', now.format());
    console.log('Flexible start:', flexibleStart.format());
    console.log('Flexible end:', flexibleEnd.format());

    // Handle overnight shifts
    if (shiftEnd.isBefore(shiftStart)) {
      if (now.isBetween(flexibleStart, flexibleEnd.clone().add(1, 'day'))) {
        return false;
      }
    } else {
      if (now.isBetween(flexibleStart, flexibleEnd)) {
        return false;
      }
    }

    return true;
  }, [getEffectiveShift, TIMEZONE]);

  const isCheckInOutAllowed = useCallback(async () => {
    const effectiveShiftData = await getEffectiveShift();
    if (!effectiveShiftData) {
      console.error('No effective shift data found');
      return {
        allowed: false,
        reason: 'ไม่พบข้อมูลกะการทำงาน กรุณาติดต่อ HR',
        isLate: false,
        isOvertime: false,
      };
    }

    const { shiftStart, shiftEnd } = effectiveShiftData;
    let now = moment().tz(TIMEZONE);

    // Handle ongoing overtime from previous day
    if (
      attendanceStatus.latestAttendance &&
      moment(attendanceStatus.latestAttendance.checkInTime).isBefore(
        now.startOf('day'),
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

    const twoHoursBeforeShift = shiftStart.clone().subtract(2, 'hours');
    const lateThreshold = shiftStart.clone().add(30, 'minutes');
    const overtimeThreshold = shiftEnd.clone().add(5, 'minutes');

    // Handle ongoing overtime from previous day or incomplete overtime records
    if (
      attendanceStatus.latestAttendance &&
      (moment(attendanceStatus.latestAttendance.checkInTime).isBefore(
        now.startOf('day'),
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

    // Handle overnight shifts
    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
      if (now.isBefore(shiftStart)) {
        now.add(1, 'day');
      }
    }

    if (attendanceStatus.isCheckingIn) {
      if (now.isBefore(twoHoursBeforeShift)) {
        return {
          allowed: false,
          reason: 'ยังไม่ถึงเวลาเข้างาน กรุณารอจนกว่าจะถึงเวลาที่กำหนด',
          isLate: false,
          isOvertime: false,
        };
      }

      if (now.isAfter(lateThreshold)) {
        return {
          allowed: true,
          reason: 'คุณกำลังเข้างานสาย',
          isLate: true,
          isOvertime: false,
        };
      }
    } else {
      if (now.isBefore(shiftEnd)) {
        return {
          allowed: true,
          reason: 'คุณกำลังออกงานก่อนเวลา',
          isLate: false,
          isOvertime: false,
        };
      }

      if (now.isAfter(overtimeThreshold)) {
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

  useEffect(() => {
    const initializeState = async () => {
      setIsLoading(true);
      try {
        console.log('Initializing state with user data:', userData);
        console.log('Attendance status:', attendanceStatus);
        const [outsideShift, checkInOutAllowed] = await Promise.all([
          isOutsideShift(),
          isCheckInOutAllowed(),
        ]);
        console.log('State initialized:', { outsideShift, checkInOutAllowed });
        setIsOutsideShiftState(outsideShift);
        setCheckInOutAllowedState(checkInOutAllowed);
        setDisabledReason(checkInOutAllowed.reason);
      } catch (error) {
        console.error('Error initializing state:', error);
        setErrorMessage('An error occurred while loading shift information.');
      } finally {
        setIsLoading(false);
      }
    };

    initializeState();
  }, [isOutsideShift, isCheckInOutAllowed, userData, attendanceStatus]);

  const handleError = (error: unknown, customMessage: string) => {
    console.error(customMessage, error);
    if (axios.isAxiosError(error) && error.response) {
      setErrorMessage(
        `${customMessage}: ${error.response.data.message || error.message}`,
      );
    } else if (error instanceof Error) {
      setErrorMessage(`${customMessage}: ${error.message}`);
    } else {
      setErrorMessage(`${customMessage}. Please try again.`);
    }
  };

  const fetchApiKey = useCallback(async () => {
    try {
      const response = await axios.get('/api/getMapApiKey');
      setApiKey(response.data.apiKey);
    } catch (error) {
      handleError(error, 'Error fetching API key');
    }
  }, []);

  useEffect(() => {
    fetchApiKey();
  }, [fetchApiKey]);

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
        return premise.name; // If within a premise, return the premise name
      }
      try {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API}`,
        );
        if (response.data.results && response.data.results.length > 0) {
          return response.data.results[0].formatted_address;
        } else {
          throw new Error('No address found');
        }
      } catch (error) {
        console.error('Error fetching address:', error);
        setAddressError('Unable to fetch address. Using premise location.');
        // Return the name of the nearest premise instead
        const nearestPremise = isWithinPremises(lat, lng);
        return nearestPremise ? nearestPremise.name : 'Unknown location';
      }
    },
    [GOOGLE_MAPS_API, isWithinPremises],
  );

  useEffect(() => {
    const getCurrentLocation = async () => {
      if (!navigator.geolocation) {
        setErrorMessage(
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

        // Check if the location is within premises to set inPremises state
        const premise = isWithinPremises(newLocation.lat, newLocation.lng);
        setInPremises(!!premise);
      } catch (error) {
        handleError(
          error,
          'Unable to get precise location. Using default location.',
        );
      }
    };

    getCurrentLocation();
  }, [getAddressFromCoordinates, isWithinPremises]);

  const handleCheckInOut = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (!photo) {
        throw new Error('No photo captured. Please try again.');
      }

      const { allowed, reason, isLate, isOvertime } =
        await isCheckInOutAllowed();

      if (!allowed) {
        setErrorMessage(reason || 'Check-in/out not allowed at this time');
        return;
      }

      setIsLate(isLate);
      setIsOvertime(isOvertime);

      if (isLate && attendanceStatus.isCheckingIn) {
        setIsLateModalOpen(true);
        return;
      }

      const successMsg = await submitCheckInOut();
      router.push('/checkInOutSuccess');
    } catch (error) {
      console.error('Error during check-in/out:', error);
      setErrorMessage(
        'An error occurred during check-in/out. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLateReasonSubmit = async (lateReason: string) => {
    setIsLateModalOpen(false);
    setLoading(true);
    try {
      await submitCheckInOut(lateReason);
      // Navigate directly to success page
      router.push('/checkInOutSuccess');
    } catch (error) {
      console.error('Error during late check-in:', error);
      setErrorMessage('An error occurred during check-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitCheckInOut = async (lateReasonInput?: string) => {
    try {
      const localCheckTime = moment().tz(TIMEZONE);
      const checkInOutData = {
        employeeId: userData.employeeId,
        lineUserId: userData.lineUserId,
        checkTime: localCheckTime.toISOString(),
        location: location ? JSON.stringify(location) : null,
        address,
        reason: lateReasonInput || reason,
        photo,
        deviceSerial: 'WEBAPP001',
        isCheckIn: attendanceStatus.isCheckingIn,
        isOvertime,
        isLate,
      };

      console.log('Submitting data:', checkInOutData);

      const response = await axios.post('/api/check-in-out', checkInOutData);

      console.log('Check-in/out response:', response.data);

      if (response.data) {
        const newStatus = !attendanceStatus.isCheckingIn;
        setAttendanceStatus((prevStatus) => ({
          ...prevStatus,
          isCheckingIn: newStatus,
          latestAttendance: response.data,
        }));
        onStatusChange(newStatus);

        setStep('info');
        setPhoto(null);
        setReason('');
        setLateReason('');

        let successMsg = `Successfully ${newStatus ? 'checked out' : 'checked in'}.`;
        if (isLate && !newStatus) {
          successMsg += ' Late check-in has been recorded.';
        }
        if (isOvertime) {
          successMsg += ' Overtime has been recorded.';
        }
        setSuccessMessage(successMsg);

        // Don't navigate here, let the caller handle navigation
        return successMsg;
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error during check-in/out:', error);
      throw error;
    }
  };

  const renderStep1 = () => {
    if (isLoading) {
      return <div>Loading shift information...</div>;
    }

    return (
      <div className="flex flex-col h-full">
        <UserShiftInfo
          userData={userData}
          attendanceStatus={attendanceStatus}
          departmentName={userData.department}
          isOutsideShift={isOutsideShiftState}
        />

        <div className="flex-shrink-0 mt-4">
          <button
            onClick={() => setStep('camera')}
            disabled={!checkInOutAllowedState.allowed}
            className={`w-full ${
              checkInOutAllowedState.allowed
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-400 cursor-not-allowed'
            } text-white py-3 px-4 rounded-lg transition duration-300`}
            aria-label={`เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
          >
            {checkInOutAllowedState.allowed
              ? `เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`
              : 'ไม่สามารถลงเวลาได้ในขณะนี้'}
          </button>
          {checkInOutAllowedState.reason && (
            <p className="text-red-500 text-center text-sm mt-2">
              {checkInOutAllowedState.reason}
            </p>
          )}
        </div>
      </div>
    );
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
            onUserMedia={() => console.log('Camera is ready')}
            onUserMediaError={(error) =>
              handleError(error, 'Failed to access camera')
            }
          />
          <p className="text-center mb-2">{message}</p>
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
          {addressError ? (
            <p className="text-red-500">{addressError}</p>
          ) : (
            <div
              id="address-display"
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5"
              aria-live="polite"
            >
              {address || 'Loading address...'}
            </div>
          )}
        </div>
        {apiKey && location ? (
          <div className="mb-4">
            <InteractiveMap
              apiKey={apiKey}
              lat={location.lat}
              lng={location.lng}
            />
          </div>
        ) : (
          <SkeletonLoader />
        )}
        {!inPremises && (
          <div className="mt-4">
            <label
              htmlFor="reason-input"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              เหตุผลสำหรับการ
              {attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
              นอกสถานที่
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
          disabled={loading || (!inPremises && !reason)}
          className="w-full bg-red-500 text-white py-3 px-4 rounded-lg hover:bg-red-600 transition duration-300 disabled:bg-gray-400"
          aria-label={`ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออก'}งาน${isShiftAdjustmentNeeded ? ' และส่งคำขอปรับเปลี่ยนกะ' : ''}`}
        >
          {loading
            ? `กำลังดำเนินการ...`
            : `ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}${isShiftAdjustmentNeeded ? ' และส่งคำขอปรับเปลี่ยนกะ' : ''}`}
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
      {(errorMessage || successMessage) && (
        <div className="mt-4">
          {errorMessage && (
            <p className="text-red-500" role="alert">
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p className="text-green-500" role="status">
              {successMessage}
            </p>
          )}
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
