import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import { Attendance } from '../types/user';
import axios from 'axios';
import InteractiveMap from './InteractiveMap';

interface CheckInOutFormProps {
  userData: {
    id: string;
    employeeId: string;
    name: string;
  };
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
    name: 'Bat Cave',
  },
];

const GOOGLE_MAPS_API = process.env.GOOGLE_MAPS_API;

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({ userData }) => {
  const [isCheckingIn, setIsCheckingIn] = useState(true);
  const [latestAttendance, setLatestAttendance] = useState<Attendance | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [isLoadingCheckData, setIsLoadingCheckData] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [deviceSerial, setDeviceSerial] = useState<string>('WEBAPP001');
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [inPremises, setInPremises] = useState<boolean>(false);
  const router = useRouter();

  const webcamRef = useRef<Webcam>(null);

  const fetchAttendanceStatus = useCallback(async () => {
    setIsLoadingCheckData(true);
    try {
      const response = await axios.get('/api/check-status', {
        params: { employeeId: userData.employeeId },
      });
      setIsCheckingIn(response.data.isCheckingIn);
      setLatestAttendance(response.data.latestAttendance);
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      setError('Failed to fetch attendance status');
    } finally {
      setIsLoadingCheckData(false);
    }
  }, [userData.employeeId]);

  useEffect(() => {
    fetchAttendanceStatus();
    fetch('/api/getMapApiKey')
      .then((res) => res.json())
      .then((data) => setApiKey(data.apiKey));
  }, [fetchAttendanceStatus]);

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
    const loadFaceDetectionModel = async () => {
      await tf.ready();
      const model = await faceDetection.createDetector(
        faceDetection.SupportedModels.MediaPipeFaceDetector,
        {
          runtime: 'tfjs',
          modelType: 'short',
        },
      );
      setModel(model);
      console.log('Face detection model loaded.');
    };

    loadFaceDetectionModel();
  }, []);

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

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    return date.toLocaleString('th-TH', options);
  };

  const getDeviceType = (devSerial: string) => {
    return devSerial === '0010000' ? 'Nanta Next' : 'เครื่องสแกนใบหน้า';
  };

  const handleOpenCamera = () => {
    setShowCamera(true);
    setLatestAttendance(null);
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

        const detections = await model.estimateFaces(img, {
          flipHorizontal: false,
        });

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

  const handleSubmit = async () => {
    if (!userData.id || !location || !photo) {
      setError('User ID, location, and photo are required.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/check-in-out', {
        userId: userData.id,
        employeeId: userData.employeeId,
        checkTime: new Date(),
        location,
        address,
        reason: reason || undefined,
        photo,
        deviceSerial,
      });

      setLatestAttendance(response.data);
      setIsCheckingIn(!isCheckingIn);
      router.push('/checkInOutSuccess');
    } catch (error) {
      console.error('Check-in/out failed:', error);
      setError('Failed to process check-in/out');
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
              ) : latestAttendance ? (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-2">
                    สถานะการลงเวลาล่าสุดของคุณ:
                  </h3>
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <p>เวลา: {formatDate(latestAttendance.checkInTime)}</p>
                    <p>
                      วิธีการ:{' '}
                      {getDeviceType(
                        latestAttendance.checkInDeviceSerial || 'WEBAPP001',
                      )}
                    </p>
                    <p>
                      สถานะ:{' '}
                      {latestAttendance.checkOutTime ? 'ออกงาน' : 'เข้างาน'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mb-4">ไม่พบข้อมูลการลงเวลาล่าสุด</p>
              )}

              <button
                onClick={handleOpenCamera}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
                aria-label={`เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
              >
                เปิดกล้องเพื่อ{isCheckingIn ? 'เข้างาน' : 'ออกงาน'}
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
                เหตุผลสำหรับการ{isCheckingIn ? 'เข้างาน' : 'ออกงาน'}นอกสถานที่
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
          <div className="mt-4">
            <label
              htmlFor="device-serial-input"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              รหัสอุปกรณ์ (ถ้าใช้อุปกรณ์ภายนอก)
            </label>
            <input
              type="text"
              id="device-serial-input"
              value={deviceSerial || ''}
              onChange={(e) => setDeviceSerial(e.target.value)}
              placeholder="รหัสอุปกรณ์"
              className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
            />
          </div>

          <div className="mt-6">
            <button
              onClick={handleSubmit}
              disabled={loading || (!inPremises && !reason)}
              className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300 disabled:bg-gray-400"
              aria-label={
                loading
                  ? `กำลังลงเวลา${isCheckingIn ? 'เข้า' : 'ออก'}งาน`
                  : `ลงเวลา${isCheckingIn ? 'เข้า' : 'ออก'}งาน`
              }
            >
              {loading
                ? `กำลังลงเวลา${isCheckingIn ? 'เข้า' : 'ออก'}งาน...`
                : `ลงเวลา${isCheckingIn ? 'เข้า' : 'ออก'}งาน`}
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
