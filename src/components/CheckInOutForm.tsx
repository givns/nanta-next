import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import { AttendanceStatus, UserData } from '../types/user';
import axios from 'axios';
import InteractiveMap from './InteractiveMap';
import Image from 'next/image';
import { getDepartmentNameById } from '../lib/shiftCache';
import { useShiftDetails } from '../hooks/useShiftDetails';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';

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
  const [departmentName, setDepartmentName] = useState<string>('');
  const [isLoadingCheckData, setIsLoadingCheckData] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [address, setAddress] = useState<string>('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [reason, setReason] = useState<string>('');
  const [deviceSerial, setDeviceSerial] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [inPremises, setInPremises] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const {
    isWithinShift,
    isBeforeShift,
    isAfterShift,
    minutesUntilShiftStart,
    minutesUntilShiftEnd,
  } = useShiftDetails(attendanceStatus);
  const { webcamRef, model, isModelLoading, capturePhoto } = useFaceDetection();

  type FormStep = 'initial' | 'camera' | 'confirmation' | 'submission';
  const [currentStep, setCurrentStep] = useState<FormStep>('initial');

  const moveToNextStep = () => {
    switch (currentStep) {
      case 'initial':
        setCurrentStep('camera');
        break;
      case 'camera':
        setCurrentStep('confirmation');
        break;
      case 'confirmation':
        setCurrentStep('submission');
        break;
      case 'submission':
        setCurrentStep('initial');
        break;
    }
  };

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

  useEffect(() => {
    const deptName = getDepartmentNameById(userData.departmentId);
    setDepartmentName(deptName || 'Unknown Department');
  }, [userData.departmentId]);

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

  const getDeviceType = (deviceSerial: string | null) => {
    if (!deviceSerial) return 'ไม่ทราบ';
    return deviceSerial === 'WEBAPP001' ? 'Nanta Next' : 'เครื่องสแกนใบหน้า';
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
    async (lat: number, lng: number): Promise<string> => {
      try {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API}`,
        );

        if (response.data.results && response.data.results.length > 0) {
          return response.data.results[0].formatted_address;
        } else {
          console.warn('No address found for the given coordinates');
          return 'Address not found';
        }
      } catch (error) {
        console.error('Error fetching address:', error);
        return 'Unable to fetch address';
      }
    },
    [GOOGLE_MAPS_API],
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

        const premise = isWithinPremises(newLocation.lat, newLocation.lng);
        setInPremises(!!premise);

        const fetchedAddress = await getAddressFromCoordinates(
          newLocation.lat,
          newLocation.lng,
        );
        setAddress(fetchedAddress);
      } catch (error) {
        handleError(
          error,
          'Unable to get precise location. Using default location.',
        );
      }
    };

    getCurrentLocation();
  }, [isWithinPremises, getAddressFromCoordinates]);

  const handleOpenCamera = () => {
    setStep(2);
  };

  const handleCapturePhoto = async () => {
    try {
      const imageSrc = await capturePhoto();
      setPhoto(imageSrc);
      setStep(3);
    } catch (error) {
      handleError(error, 'Error capturing photo');
    }
  };

  const handleCheckInOut = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const checkInOutData = {
        userId: userData.id,
        employeeId: userData.employeeId,
        checkTime: new Date().toISOString(),
        location: JSON.stringify(location),
        address,
        reason: !inPremises ? reason : undefined,
        photo,
        deviceSerial: deviceSerial || 'WEBAPP001',
        isCheckIn: attendanceStatus.isCheckingIn,
        isOvertime: false,
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

        setStep(1);
        setPhoto(null);
        setReason('');
        setDeviceSerial('');

        setSuccessMessage('Check-in/out successful!');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      handleError(error, 'Error during check-in/out');
    } finally {
      setLoading(false);
    }
  };

  const renderShiftInfo = () => {
    if (!attendanceStatus) return null;

    const { user, shiftAdjustment } = attendanceStatus;
    const shift = shiftAdjustment?.requestedShift || user.assignedShift;

    if (!shift) {
      return (
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Shift Information:</h3>
          <p>No shift assigned</p>
        </div>
      );
    }

    return (
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Shift Information:</h3>
        <p>Shift: {shift.name || 'N/A'}</p>
        <p>Start Time: {shift.startTime || 'N/A'}</p>
        <p>End Time: {shift.endTime || 'N/A'}</p>
        {shiftAdjustment && (
          <p className="text-blue-600">Shift adjusted for today</p>
        )}
      </div>
    );
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="space-y-6">
      {step === 1 && (
        <div>
          {isLoadingCheckData ? (
            <SkeletonLoader />
          ) : (
            <>
              <p className="text-lg mb-2">สวัสดี, {userData.name || 'N/A'}</p>
              <p>Employee ID: {userData.employeeId || 'N/A'}</p>
              <p>Department: {departmentName}</p>
              <p>
                Current Status:{' '}
                {attendanceStatus.isCheckingIn ? 'Checking In' : 'Checking Out'}
              </p>

              {renderShiftInfo()}
              <h2>Current Shift Status</h2>
              {isWithinShift && <p>You are currently within your shift.</p>}
              {isBeforeShift && minutesUntilShiftStart > 0 && (
                <p>Your shift starts in {minutesUntilShiftStart} minutes.</p>
              )}
              {isAfterShift && <p>Your shift has ended.</p>}
              {isWithinShift && minutesUntilShiftEnd > 0 && (
                <p>Your shift ends in {minutesUntilShiftEnd} minutes.</p>
              )}
              {attendanceStatus.latestAttendance && (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2">
                    สถานะการลงเวลาล่าสุดของคุณ:
                  </h3>
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <p>
                      Date: {formatDate(attendanceStatus.latestAttendance.date)}
                    </p>
                    <p>
                      Check-in Time:{' '}
                      {formatDate(
                        attendanceStatus.latestAttendance.checkInTime,
                      )}
                    </p>
                    <p>
                      Check-out Time:{' '}
                      {attendanceStatus.latestAttendance.checkOutTime
                        ? formatDate(
                            attendanceStatus.latestAttendance.checkOutTime,
                          )
                        : 'Not checked out yet'}
                    </p>
                    <p>
                      วิธีการ:{' '}
                      {getDeviceType(
                        attendanceStatus.latestAttendance.checkInDeviceSerial,
                      )}
                    </p>
                    <p>
                      สถานะ:{' '}
                      {attendanceStatus.latestAttendance.checkOutTime
                        ? 'ออกงาน'
                        : 'เข้างาน'}
                    </p>
                  </div>
                </div>
              )}

              {isWithinShift ? (
                <button
                  onClick={handleOpenCamera}
                  className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
                  aria-label={`เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
                >
                  เปิดกล้องเพื่อ
                  {attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
                </button>
              ) : (
                <p className="text-red-500">
                  ไม่สามารถลงเวลาได้ในขณะนี้ กรุณาลองอีกครั้งในช่วงเวลาที่กำหนด
                </p>
              )}
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="mt-4">
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
              <button
                onClick={handleCapturePhoto}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
                aria-label="ถ่ายรูป"
              >
                ถ่ายรูป
              </button>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 className="text-lg font-semibold mb-2">
            ยืนยันการ{attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
          </h3>
          {photo ? (
            <Image
              src={photo}
              alt="Captured"
              width={500}
              height={300}
              layout="responsive"
              className="w-full rounded-lg mb-4"
            />
          ) : (
            <SkeletonLoader />
          )}
          <div className="mb-4">
            <label
              htmlFor="address-display"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              ที่อยู่ของคุณ
            </label>
            {address ? (
              <div
                id="address-display"
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5"
                aria-live="polite"
              >
                {address}
              </div>
            ) : (
              <SkeletonLoader />
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
          <div className="mt-6">
            <button
              onClick={handleCheckInOut}
              disabled={loading || (!inPremises && !reason)}
              className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300 disabled:bg-gray-400"
              aria-label={
                loading
                  ? `กำลังลงเวลา${attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน`
                  : `ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน`
              }
            >
              {loading
                ? `กำลังลงเวลา${attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน...`
                : `ลงเวลา${attendanceStatus.isCheckingIn ? 'เข้า' : 'ออก'}งาน`}
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="text-red-500 mt-4" role="alert">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="text-green-500 mt-4" role="status">
          {successMessage}
        </p>
      )}
    </div>
  );
};

export default CheckInOutForm;
