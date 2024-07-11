import React, { useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import '@tensorflow/tfjs-backend-webgl';
import { AttendanceStatus, UserData } from '../types/user';
import axios from 'axios';
import InteractiveMap from './InteractiveMap';
import Image from 'next/image';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';

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

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  initialAttendanceStatus,
  onStatusChange,
}) => {
  console.log('Rendering CheckInOutForm', {
    userData,
    initialAttendanceStatus,
  });

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

  const handlePhotoCapture = useCallback((capturedPhoto: string) => {
    setPhoto(capturedPhoto);
    setStep('confirm');
  }, []);

  const {
    webcamRef,
    isModelLoading,
    photo,
    setPhoto,
    message,
    resetDetection,
  } = useFaceDetection(5, handlePhotoCapture);

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

  const checkIfShiftAdjustmentNeeded = () => {
    const shift =
      attendanceStatus.shiftAdjustment?.requestedShift ||
      userData.assignedShift;

    // Add a null check or default assignment before accessing properties of 'shift'
    if (shift) {
      const checkInTime = new Date(
        attendanceStatus.latestAttendance?.checkInTime || new Date(),
      );
      const shiftStartTime = new Date(checkInTime);
      const [startHour, startMinute] = shift.startTime.split(':').map(Number);
      shiftStartTime.setHours(startHour, startMinute, 0, 0);

      setIsShiftAdjustmentNeeded(checkInTime < shiftStartTime);
    }
  };

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

      const checkInOutData = {
        userId: userData.id,
        employeeId: userData.employeeId,
        checkTime: new Date().toISOString(),
        location: location ? JSON.stringify(location) : null,
        address,
        reason: !inPremises ? reason : undefined,
        photo,
        deviceSerial: 'WEBAPP001', // Assuming this is the default for web app
        isCheckIn: attendanceStatus.isCheckingIn,
        isOvertime: false, // You might want to determine this based on shift times
        requiresShiftAdjustment: isShiftAdjustmentNeeded,
      };

      console.log('Submitting data:', checkInOutData);

      const response = await axios.post('/api/check-in-out', checkInOutData);

      console.log('Check-in/out response:', response.data);

      if (response.data && response.data.success) {
        const newStatus = !attendanceStatus.isCheckingIn;
        setAttendanceStatus((prevStatus) => ({
          ...prevStatus,
          isCheckingIn: newStatus,
          latestAttendance: response.data.attendance,
        }));
        onStatusChange(newStatus);

        setStep('info'); // Reset to initial step
        setPhoto(null);
        setReason('');

        let successMsg = `Successfully ${newStatus ? 'checked out' : 'checked in'}.`;
        if (isShiftAdjustmentNeeded) {
          successMsg +=
            ' Shift adjustment request has been submitted for approval.';
        }
        setSuccessMessage(successMsg);
      } else {
        throw new Error(
          response.data.message || 'Invalid response from server',
        );
      }
    } catch (error) {
      console.error('Error during check-in/out:', error);
      if (axios.isAxiosError(error) && error.response) {
        setErrorMessage(
          `Error: ${error.response.data.message || error.message}`,
        );
      } else if (error instanceof Error) {
        setErrorMessage(`Error: ${error.message}`);
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-grow overflow-hidden flex flex-col justify-center">
        {step === 'info' && (
          <div className="h-full flex flex-col justify-between">
            <UserShiftInfo
              userData={userData}
              attendanceStatus={attendanceStatus}
              departmentName={userData.department}
            />
            <button
              onClick={() => setStep('camera')}
              className="mt-4 w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
              aria-label={`เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน`}
            >
              เปิดกล้องเพื่อ{attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน
            </button>
          </div>
        )}

        {step === 'camera' && (
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
        )}

        {step === 'confirm' && (
          <div className="h-full flex flex-col justify-between">
            <div className="overflow-y-auto">
              <h3 className="text-lg font-semibold mb-2">
                ยืนยันการ{attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
              </h3>
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
            <div className="mt-6">
              <button
                onClick={handleCheckInOut}
                disabled={loading || (!inPremises && !reason)}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300 disabled:bg-gray-400"
                aria-label={`ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน${isShiftAdjustmentNeeded ? ' และส่งคำขอปรับเปลี่ยนกะ' : ''}`}
              >
                {loading
                  ? `กำลังดำเนินการ...`
                  : `ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน${isShiftAdjustmentNeeded ? ' และส่งคำขอปรับเปลี่ยนกะ' : ''}`}
              </button>
            </div>
          </div>
        )}
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
    </div>
  );
};
export default CheckInOutForm;
