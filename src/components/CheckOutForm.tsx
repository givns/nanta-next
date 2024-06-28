import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import { sendCheckInFlexMessage } from '@/utils/sendCheckInFlexMessage';
import StaticMap from './StaticMap';

interface CheckOutFormProps {
  checkInId: string;
  lineUserId: string;
}

interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string | null;
  profilePictureUrl: string | null;
  createdAt: Date;
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
];

const GOOGLE_MAPS_API = process.env.GOOGLE_MAPS_API;

const CheckOutForm: React.FC<CheckOutFormProps> = ({
  lineUserId,
  checkInId,
}) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
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
  const webcamRef = useRef<Webcam>(null);

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
    fetch('/api/getMapApiKey')
      .then((res) => res.json())
      .then((data) => setApiKey(data.apiKey));
  }, []);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        const response = await axios.get(`/api/user/${lineUserId}`);
        const user = response.data;
        setUserData({
          id: user.id,
          lineUserId: user.lineUserId,
          name: user.name,
          nickname: user.nickname,
          department: user.department,
          employeeNumber: user.employeeNumber,
          profilePictureUrl: user.profilePictureUrl,
          createdAt: new Date(user.createdAt),
        });
      } catch (error) {
        console.error('Error fetching user details:', error);
        setError('Unable to fetch user details. Please try again.');
      }
    };

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

    fetchUserDetails();
    loadFaceDetectionModel();
  }, [lineUserId]);

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
              // Use the geocoding service to get the address for locations outside premises
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
          setError('No face detected. Please try again.');
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

  const handleCheckOut = async () => {
    if (!userData?.id || !location || !photo) {
      setError('User ID, location, and photo are required for check-in.');
      return;
    }
    console.log('User Data:', userData); // Check the contents of userData

    setLoading(true);
    setError(null);
    try {
      // Get the current time and adjust to GMT+7
      const currentTime = new Date();
      const timeZoneOffset = 7 * 60; // GMT+7 in minutes
      const localTime = new Date(
        currentTime.getTime() + timeZoneOffset * 60 * 1000,
      );

      const data = {
        userId: userData.id,
        name: userData.name, // Ensure this field is included
        nickname: userData.nickname, // Ensure this field is included
        department: userData.department, // Ensure this field is included
        address,
        reason: reason || null, // Ensure reason is properly handled as an optional field
        photo,
        timestamp: localTime.toISOString(), // Correct timestamp
      };

      console.log('Data to send:', data); // Check the data being sent to the backend
      const response = await axios.post('/api/check-out', data);

      if (response.status === 200) {
        const checkOutData = response.data.data; // Assuming response.data contains the saved check-in data

        // Send flex message
        await sendCheckInFlexMessage(userData, checkOutData);

        console.log('Check-out successful');
        alert('Check-out successful!');
      } else {
        setError('Check-out failed. Please try again.');
      }
    } catch (error) {
      console.error('Check-out failed:', error);
      setError('Failed to check in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!userData) {
    return <div>Loading user data...</div>;
  }

  return (
    <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          ระบบบันทึกเวลาออกงาน
        </h1>
        {!showCamera && step === 1 && (
          <div className="text-6xl font-bold text-center mb-8 text-blue-600">
            {new Date().toLocaleTimeString()}
          </div>
        )}
        <div className="space-y-6">
          {step === 1 && (
            <div>
              <p className="text-lg mb-2">สวัสดี, {userData.name}</p>
              <p className="text-md mb-4 text-gray-600">
                {userData.department}
              </p>
              {!showCamera ? (
                <button
                  onClick={() => setShowCamera(true)}
                  className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
                  aria-label="เปิดกล้องเพื่อถ่ายรูป"
                >
                  เปิดกล้องเพื่อถ่ายรูป
                </button>
              ) : (
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
                    {model ? 'ถ่ายรูป' : 'กำลังโหลดรูปถ่าย...'}
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
              {apiKey && <StaticMap apiKey={apiKey} />}
              {!inPremises && (
                <div className="mt-4">
                  <label
                    htmlFor="reason-input"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    เหตุผลสำหรับการออกงานนอกสถานที่
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
                  onClick={handleCheckOut}
                  disabled={loading || (!inPremises && !reason)}
                  className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300 disabled:bg-gray-400"
                  aria-label={loading ? 'กำลังลงเวลาออกงาน' : 'ลงเวลาออกงาน'}
                >
                  {loading ? 'กำลังลงเวลาออกงาน...' : 'ลงเวลาออกงาน'}
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
      </div>
    </div>
  );
};
export default CheckOutForm;
