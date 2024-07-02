import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import { AttendanceStatus } from '../types/user';
import axios from 'axios';
import InteractiveMap from './InteractiveMap';

interface CheckInOutFormProps {
  userData: {
    id: string;
    employeeId: string;
    name: string;
  };
}

const BANGKOK_TIMEZONE = 'Asia/Bangkok';

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

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({ userData }) => {
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const [isLoadingCheckData, setIsLoadingCheckData] = useState(true);
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

  useEffect(() => {
    fetchAttendanceStatus();
    loadFaceDetectionModel();
    fetchApiKey();
  }, [userData.employeeId]);

  const fetchAttendanceStatus = async () => {
    setIsLoadingCheckData(true);
    try {
      const response = await axios.get<AttendanceStatus>('/api/check-status', {
        params: { employeeId: userData.employeeId },
      });
      setAttendanceStatus(response.data);
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      setError('Failed to fetch attendance status');
    } finally {
      setIsLoadingCheckData(false);
    }
  };

  const loadFaceDetectionModel = async () => {
    await tf.ready();
    const loadedModel = await faceDetection.createDetector(
      faceDetection.SupportedModels.MediaPipeFaceDetector,
      { runtime: 'tfjs', modelType: 'short' },
    );
    setModel(loadedModel);
    console.log('Face detection model loaded.');
  };

  const fetchApiKey = async () => {
    try {
      const response = await axios.get('/api/getMapApiKey');
      setApiKey(response.data.apiKey);
    } catch (error) {
      console.error('Error fetching API key:', error);
    }
  };

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
    const Δλ = ((lon1 - lon2) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
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

  const getAddressFromCoordinates = async (
    lat: number,
    lng: number,
  ): Promise<string> => {
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
  };

  useEffect(() => {
    const getCurrentLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            console.log('Current location:', { lat: latitude, lng: longitude });
            setLocation({ lat: latitude, lng: longitude });

            const premise = isWithinPremises(latitude, longitude);
            if (premise) {
              setInPremises(true);
              setAddress(premise.name);
            } else {
              setInPremises(false);
              const fetchedAddress = await getAddressFromCoordinates(
                latitude,
                longitude,
              );
              setAddress(fetchedAddress);
            }
          },
          (error) => {
            console.error('Error getting current location:', error);
            setError('Unable to get current location. Please try again.');
          },
        );
      } else {
        console.error('Geolocation is not supported by this browser.');
        setError(
          'Geolocation is not supported by your browser. Please use a different device or browser.',
        );
      }
    };

    getCurrentLocation();
  }, [isWithinPremises]);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: BANGKOK_TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  };

  const convertUTCToBangkokDate = (utcDateString: string) => {
    const date = new Date(utcDateString);
    return new Date(date.getTime() + 7 * 60 * 60 * 1000).toLocaleDateString(
      'th-TH',
      {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      },
    );
  };

  const convertUTCToBangkokTime = (utcDateString: string) => {
    const date = new Date(utcDateString);
    return new Date(date.getTime() + 7 * 60 * 60 * 1000).toLocaleTimeString(
      'th-TH',
      {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      },
    );
  };

  const getDeviceType = (deviceSerial: string | null) => {
    if (!deviceSerial) return 'ไม่ทราบ';
    return deviceSerial === 'WEBAPP001' ? 'Nanta Next' : 'เครื่องสแกนใบหน้า';
  };

  const handleOpenCamera = () => {
    setShowCamera(true);
    setError(null); // Clear any existing errors when opening the camera
  };

  const capturePhoto = async () => {
    console.log('Attempting to capture photo');
    if (webcamRef.current && model) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        const img = new Image();
        img.src = imageSrc;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        // Convert the Image to an HTMLImageElement
        const imgElement = img as unknown as HTMLImageElement;

        const detections = await model.estimateFaces(imgElement);

        if (detections.length > 0) {
          console.log('Photo captured successfully');
          setPhoto(imageSrc);
          setShowCamera(false);
          setStep(2); // Move to the next step after successful capture
        } else {
          console.error('No face detected');
          setError('ไม่พบใบหน้า กรุณาลองอีกครั้ง');
        }
      } else {
        console.error('Failed to capture photo: imageSrc is null');
        setError('Failed to capture photo. Please try again.');
      }
    } else {
      console.error('Webcam ref is null or model is not loaded');
      setError(
        'Camera is not initialized or face detection model is not loaded. Please refresh the page and try again.',
      );
    }
  };

  const handleCheckInOut = async () => {
    setLoading(true);
    setError(null); // Reset error state
    try {
      const response = await axios.post('/api/check-in-out', {
        userId: userData.id,
        employeeId: userData.employeeId,
        photo: photo,
        timestamp: new Date().toISOString(), // Use ISO string for consistency
        isCheckIn: attendanceStatus?.isCheckingIn,
        location,
        address,
        reason: !inPremises ? reason : undefined,
        deviceSerial: deviceSerial || undefined,
      });

      console.log('Check-in/out response:', response.data);

      if (response.data.success) {
        await fetchAttendanceStatus();
        setStep(1);
        setShowCamera(false);
        setPhoto(null);
        setReason('');
        setDeviceSerial('');
      } else {
        setError(
          response.data.error || 'เกิดข้อผิดพลาดในการลงเวลา กรุณาลองอีกครั้ง',
        );
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

  return (
    <div className="space-y-6">
      {step === 1 && (
        <div>
          <p className="text-lg mb-2">สวัสดี, {userData.name}</p>

          {!showCamera && (
            <>
              {isLoadingCheckData ? (
                <div className="mb-4 text-center">
                  <p>กำลังโหลดข้อมูลการลงเวลาล่าสุด กรุณารอสักครู่...</p>
                </div>
              ) : attendanceStatus?.latestAttendance ? (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2">
                    สถานะการลงเวลาล่าสุดของคุณ:
                  </h3>
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <p>
                      วันที่:{' '}
                      {convertUTCToBangkokDate(
                        attendanceStatus.latestAttendance.checkInTime.toString(),
                      )}
                    </p>
                    <p>
                      เวลา:{' '}
                      {convertUTCToBangkokTime(
                        attendanceStatus.latestAttendance.checkInTime.toString(),
                      )}
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
              ) : (
                <p className="mb-4">ไม่พบข้อมูลการลงเวลาล่าสุด</p>
              )}

              <button
                onClick={handleOpenCamera}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
                aria-label={`เปิดกล้องเพื่อ${attendanceStatus?.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
              >
                เปิดกล้องเพื่อ
                {attendanceStatus?.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
              </button>
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
            <img
              src={photo}
              alt="Captured"
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

export default CheckInOutForm;
