import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import { AttendanceStatus, UserData, UserResponse } from '../types/user';
import axios from 'axios';
import InteractiveMap from './InteractiveMap';
import Image from 'next/image';
import { getDepartmentNameById } from '../lib/shiftCache';

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
  const [attendanceStatus, setAttendanceStatus] = useState(
    initialAttendanceStatus,
  );
  const [departmentName, setDepartmentName] = useState<string>('');
  const [isWithinShift, setIsWithinShift] = useState(false);
  const [isBeforeShift, setIsBeforeShift] = useState(false);
  const [isAfterShift, setIsAfterShift] = useState(false);
  const [minutesUntilShiftStart, setMinutesUntilShiftStart] = useState(0);
  const [minutesUntilShiftEnd, setMinutesUntilShiftEnd] = useState(0);

  const [isLoadingCheckData, setIsLoadingCheckData] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [showCamera, setShowCamera] = useState(false);
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
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

  const webcamRef = useRef<Webcam>(null);

  const fetchAttendanceStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log(
        'Fetching attendance status for employeeId:',
        userData.employeeId,
      );
      const response = await axios.get<UserResponse>('/api/users', {
        params: { lineUserId: userData.lineUserId },
      });
      console.log('User response:', response.data);
      setAttendanceStatus(response.data.attendanceStatus);

      if (response.data.user.departmentId) {
        const deptName = getDepartmentNameById(response.data.user.departmentId);
        setDepartmentName(deptName || 'Unknown Department');
      } else {
        setDepartmentName('Department Not Assigned');
      }
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      if (axios.isAxiosError(error) && error.response) {
        setError(
          `Failed to fetch attendance status: ${error.response.data.message || error.message}`,
        );
      } else {
        setError(
          'An unexpected error occurred while fetching attendance status.',
        );
      }
    } finally {
      setIsLoadingCheckData(false);
      setIsLoading(false);
    }
  }, [userData.lineUserId, userData.employeeId]);

  const fetchShiftDetails = useCallback(async () => {
    if (!attendanceStatus) return;

    const now = new Date();
    let shift = attendanceStatus.user.assignedShift;

    if (attendanceStatus.shiftAdjustment) {
      try {
        const response = await axios.get(
          `/api/shifts/${attendanceStatus.shiftAdjustment.requestedShiftId}`,
        );
        shift = response.data;
      } catch (error) {
        console.error('Error fetching requested shift:', error);
      }
    }

    // If there's no shift data, we can't calculate shift details
    if (!shift) {
      console.log('No shift data available');
      setIsWithinShift(false);
      setIsBeforeShift(false);
      setIsAfterShift(false);
      setMinutesUntilShiftStart(0);
      setMinutesUntilShiftEnd(0);
      return;
    }

    // Provide default values if startTime or endTime are undefined
    const [startHour, startMinute] = (shift.startTime || '00:00')
      .split(':')
      .map(Number);
    const [endHour, endMinute] = (shift.endTime || '23:59')
      .split(':')
      .map(Number);

    const shiftStart = new Date(now);
    shiftStart.setHours(startHour, startMinute, 0, 0);

    const shiftEnd = new Date(now);
    shiftEnd.setHours(endHour, endMinute, 0, 0);

    // Handle shifts that cross midnight
    if (
      endHour < startHour ||
      (endHour === startHour && endMinute < startMinute)
    ) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    const isWithinShift = now >= shiftStart && now <= shiftEnd;
    const isBeforeShift = now < shiftStart;
    const isAfterShift = now > shiftEnd;

    const minutesUntilShiftStart = isBeforeShift
      ? Math.floor((shiftStart.getTime() - now.getTime()) / 60000)
      : 0;

    const minutesUntilShiftEnd = isWithinShift
      ? Math.floor((shiftEnd.getTime() - now.getTime()) / 60000)
      : 0;

    setIsWithinShift(isWithinShift);
    setIsBeforeShift(isBeforeShift);
    setIsAfterShift(isAfterShift);
    setMinutesUntilShiftStart(minutesUntilShiftStart);
    setMinutesUntilShiftEnd(minutesUntilShiftEnd);
  }, [attendanceStatus]);

  const refreshAttendanceStatus = useCallback(async () => {
    try {
      const response = await axios.get<AttendanceStatus>('/api/check-status', {
        params: { employeeId: userData.employeeId },
      });
      setAttendanceStatus(response.data);
      onStatusChange(response.data.isCheckingIn);
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      // Handle error (e.g., show an error message to the user)
    }
  }, [userData.employeeId, onStatusChange]);

  const loadFaceDetectionModel = useCallback(async () => {
    await tf.ready();
    const loadedModel = await faceDetection.createDetector(
      faceDetection.SupportedModels.MediaPipeFaceDetector,
      { runtime: 'tfjs', modelType: 'short' },
    );
    setModel(loadedModel);
    console.log('Face detection model loaded.');
  }, []);

  const fetchApiKey = useCallback(async () => {
    try {
      const response = await axios.get('/api/getMapApiKey');
      setApiKey(response.data.apiKey);
    } catch (error) {
      console.error('Error fetching API key:', error);
    }
  }, []);

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
    [],
  );

  useEffect(() => {
    console.log('userData:', userData);
    fetchAttendanceStatus().catch((error) => {
      console.error('Error in fetchAttendanceStatus:', error);
    });
    fetchShiftDetails().catch((error) => {
      console.error('Error in fetchShiftDetails:', error);
    });
    loadFaceDetectionModel().catch((error) => {
      console.error('Error in loadFaceDetectionModel:', error);
    });
    fetchApiKey().catch((error) => {
      console.error('Error in fetchApiKey:', error);
    });
  }, [
    fetchAttendanceStatus,
    fetchShiftDetails,
    refreshAttendanceStatus,
    loadFaceDetectionModel,
    fetchApiKey,
    userData,
  ]);

  useEffect(() => {
    const getCurrentLocation = async () => {
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject);
            },
          );
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        } catch (error) {
          console.error('Error getting location:', error);
          setLocation(null);
          setError('Unable to get precise location. Using default location.');
        }
      } else {
        setLocation(null);
        setError(
          'Geolocation is not supported by this browser. Using default location.',
        );
      }
    };

    getCurrentLocation();
  }, [isWithinPremises, getAddressFromCoordinates]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!attendanceStatus) {
    return <div>No attendance status available.</div>;
  }

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

  const getDeviceType = (deviceSerial: string | null) => {
    if (!deviceSerial) return 'ไม่ทราบ';
    return deviceSerial === 'WEBAPP001' ? 'Nanta Next' : 'เครื่องสแกนใบหน้า';
  };

  const handleOpenCamera = () => {
    setShowCamera(true);
  };

  const capturePhoto = async () => {
    setError(null);
    console.log('Attempting to capture photo');
    if (webcamRef.current && model) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        try {
          const img = new window.Image();
          img.src = imageSrc;
          await new Promise((resolve) => {
            img.onload = resolve;
          });

          const detections = await model.estimateFaces(img);

          if (detections.length > 0) {
            console.log('Photo captured successfully');
            setPhoto(imageSrc);
            setShowCamera(false);
            setStep((prevStep) => prevStep + 1);
            console.log('Step incremented');
          } else {
            console.error('No face detected');
            setError('ไม่พบใบหน้า กรุณาลองอีกครั้ง');
          }
        } catch (error) {
          console.error('Error capturing photo:', error);
          setError(
            'Unable to capture photo. Proceeding with check-in without photo.',
          );
          setStep((prevStep) => prevStep + 1);
        }
      } else {
        setError(
          'Camera not available. Proceeding with check-in without photo.',
        );
        setStep((prevStep) => prevStep + 1);
      }
    }

    const handleCheckInOut = async () => {
      setLoading(true);
      setError(null);
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
          // Update local state
          const newStatus = !attendanceStatus.isCheckingIn;
          setAttendanceStatus((prevStatus) => ({
            ...prevStatus,
            isCheckingIn: newStatus,
            latestAttendance: response.data.attendance,
          }));
          onStatusChange(newStatus);

          // Reset form state
          setStep(1);
          setShowCamera(false);
          setPhoto(null);
          setReason('');
          setDeviceSerial('');

          // Show a success message
          setError('Check-in/out successful!'); // Using setError for success message
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (error) {
        console.error('Error during check-in/out:', error);
        if (axios.isAxiosError(error) && error.response) {
          setError(
            `เกิดข้อผิดพลาดในการลงเวลา: ${error.response.data.message || error.message}`,
          );
        } else {
          setError('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองอีกครั้ง');
        }
      } finally {
        setLoading(false);
      }
    };

    const isWithinShiftTime = () => {
      if (!attendanceStatus) return false;

      const now = new Date();
      const shift =
        attendanceStatus.shiftAdjustment?.requestedShift ||
        attendanceStatus.user.assignedShift;

      // If there's no shift assigned, we can't determine if it's within shift time
      if (!shift) return false;

      // Provide default values if startTime or endTime are undefined
      const [startHour, startMinute] = (shift.startTime || '00:00')
        .split(':')
        .map(Number);
      const [endHour, endMinute] = (shift.endTime || '23:59')
        .split(':')
        .map(Number);

      const shiftStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        startHour,
        startMinute,
      );
      const shiftEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        endHour,
        endMinute,
      );

      // Handle shifts that cross midnight
      if (
        endHour < startHour ||
        (endHour === startHour && endMinute < startMinute)
      ) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      // Allow check-in up to 30 minutes before shift start
      const earliestCheckIn = new Date(shiftStart.getTime() - 30 * 60000);

      return now >= earliestCheckIn && now <= shiftEnd;
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
            <p className="text-lg mb-2">สวัสดี, {attendanceStatus.user.name}</p>
            <p>Employee ID: {attendanceStatus.user.employeeId}</p>
            <p>Department: {departmentName}</p>

            {!showCamera && (
              <>
                {isLoadingCheckData ? (
                  <div className="mb-4 text-center">
                    <p>กำลังโหลดข้อมูลการลงเวลาล่าสุด กรุณารอสักครู่...</p>
                  </div>
                ) : (
                  <>
                    {renderShiftInfo()}
                    <h2>Current Shift Status</h2>
                    {isWithinShift && (
                      <p>You are currently within your shift.</p>
                    )}
                    {isBeforeShift && minutesUntilShiftStart > 0 && (
                      <p>
                        Your shift starts in {minutesUntilShiftStart} minutes.
                      </p>
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
                            Date:{' '}
                            {formatDate(attendanceStatus.latestAttendance.date)}
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
                                  attendanceStatus.latestAttendance
                                    .checkOutTime,
                                )
                              : 'Not checked out yet'}
                          </p>
                          <p>
                            วิธีการ:{' '}
                            {getDeviceType(
                              attendanceStatus.latestAttendance
                                .checkInDeviceSerial,
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

                    {isWithinShiftTime() ? (
                      <button
                        onClick={handleOpenCamera}
                        className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
                        aria-label={`เปิดกล้องเพื่อ${attendanceStatus?.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
                      >
                        เปิดกล้องเพื่อ
                        {attendanceStatus?.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
                      </button>
                    ) : (
                      <p className="text-red-500">
                        ไม่สามารถลงเวลาได้ในขณะนี้
                        กรุณาลองอีกครั้งในช่วงเวลาที่กำหนด
                      </p>
                    )}
                  </>
                )}
              </>
            )}

            {showCamera && (
              <div className="mt-4">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  className="w-full rounded-lg mb-4"
                  onUserMedia={() => console.log('Camera is ready')}
                  onUserMediaError={(error) => {
                    console.error('Camera error:', error);
                    setError(
                      'Failed to access camera. Please check your camera permissions and try again.',
                    );
                  }}
                />
                <button
                  onClick={capturePhoto}
                  className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
                  aria-label="ถ่ายรูป"
                  disabled={!model}
                >
                  {model ? 'ถ่ายรูป' : 'กำลังเปิดกล้อง...'}
                </button>
              </div>
            )}
          </div>
        )}
        {step === 2 && (
          <div>
            <h3 className="text-lg font-semibold mb-2">
              ยืนยันการ{attendanceStatus?.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
            </h3>
            {photo && (
              <Image
                src={photo}
                alt="Captured"
                width={500}
                height={300}
                layout="responsive"
                className="w-full rounded-lg mb-4"
              />
            )}
            <button
              onClick={() => setStep(3)}
              className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
            >
              ถัดไป
            </button>
          </div>
        )}
        {step === 3 && (
          <div>
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
                {address || 'กำลังโหลดที่อยู่...'}
              </div>
            </div>
            {apiKey && location && (
              <div className="mb-4">
                <InteractiveMap
                  apiKey={apiKey}
                  lat={location.lat}
                  lng={location.lng}
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
                  {attendanceStatus?.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
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
            <div className="mt-6">
              <button
                onClick={handleCheckInOut}
                disabled={loading || (!inPremises && !reason)}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300 disabled:bg-gray-400"
                aria-label={
                  loading
                    ? `กำลังลงเวลา${attendanceStatus?.isCheckingIn ? 'เข้า' : 'ออก'}งาน`
                    : `ลงเวลา${attendanceStatus?.isCheckingIn ? 'เข้า' : 'ออก'}งาน`
                }
              >
                {loading
                  ? `กำลังลงเวลา${attendanceStatus?.isCheckingIn ? 'เข้า' : 'ออก'}งาน...`
                  : `ลงเวลา${attendanceStatus?.isCheckingIn ? 'เข้า' : 'ออก'}งาน`}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="text-red-500 mt-4" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  };
};
export default CheckInOutForm;
