import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { saveData } from '../services/SyncService';
import dynamic from 'next/dynamic';
import Webcam from 'react-webcam';

const GoogleMapComponent = dynamic(() => import('./GoogleMap'), { ssr: false });

interface GeneralCheckInFormProps {
  lineUserId: string;
}

interface UserData {
  id: string;
  name: string;
  department: string;
  role: string;
}

interface Premise {
  lat: number;
  lng: number;
  radius: number;
  name: string;
}

const PREMISES: Premise[] = [
  {
    lat: 13.508218242834106,
    lng: 100.76430057661977,
    radius: 100,
    name: 'บริษัท นันตา ฟู้ด จํากัด',
  },
  {
    lat: 13.514266844792308,
    lng: 100.70922876954376,
    radius: 100,
    name: 'บริษัท ปัตตานี ฟู้ด',
  },
  {
    lat: 13.747911294119723,
    lng: 100.63444550572989,
    radius: 100,
    name: 'Bat Cave',
  },
];

const GOOGLE_MAPS_API = process.env.GOOGLE_MAPS_API;

const GeneralCheckInForm: React.FC<GeneralCheckInFormProps> = ({
  lineUserId,
}) => {
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
  const [inPremises, setInPremises] = useState<boolean>(false);

  const router = useRouter();
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

  const isWithinPremises = (lat: number, lng: number): Premise | null => {
    for (const premise of PREMISES) {
      const distance = calculateDistance(lat, lng, premise.lat, premise.lng);
      if (distance <= premise.radius) {
        return premise;
      }
    }
    return null;
  };

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
        throw new Error('No results found');
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      return 'Unable to fetch address';
    }
  };

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        console.log('Fetching user details for LINE User ID:', lineUserId);
        const response = await axios.get(`/api/user/${lineUserId}`);
        console.log('User details response:', response.data);
        setUserData(response.data);
      } catch (error) {
        console.error('Error fetching user details:', error);
        setError('Unable to fetch user details. Please try again.');
      }
    };

    fetchUserDetails();
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
  }, []);

  const capturePhoto = () => {
    console.log('Attempting to capture photo');
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        console.log('Photo captured successfully');
        setPhoto(imageSrc);
        setShowCamera(false);
        setStep(2);
      } else {
        console.error('Failed to capture photo: imageSrc is null');
        setError('Failed to capture photo. Please try again.');
      }
    } else {
      console.error('Webcam ref is null');
      setError(
        'Camera is not initialized. Please refresh the page and try again.',
      );
    }
  };

  const handleCheckIn = async () => {
    if (!userData?.id || !location || !photo) {
      setError('User ID, location, and photo are required for check-in.');
      return;
    }

    if (!inPremises && !reason) {
      setError('Please provide a reason for checking in outside the premises.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = {
        userId: userData.id,
        role: userData.role,
        location,
        address,
        reason: inPremises ? '' : reason,
        photo,
        timestamp: new Date().toISOString(),
      };

      console.log('Sending check-in data:', data);
      await saveData('checkIn', data);

      console.log('Check-in successful');
      alert('Check-in successful!');
      router.push('/checkpoint');
    } catch (error) {
      console.error('Check-in failed:', error);
      setError('Failed to check in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!userData) {
    return <div>กำลังโหลดข้อมูลผู้ใช้งาน...</div>;
  }

  return (
    <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          ระบบบันทึกเวลาทำงาน
        </h1>
        <div className="text-6xl font-bold text-center mb-8 text-blue-600">
          {new Date().toLocaleTimeString()}
        </div>
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
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition duration-300"
                    aria-label="ถ่ายรูป"
                  >
                    ถ่ายรูป
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
              {location && <GoogleMapComponent center={location} />}
              {!inPremises && (
                <div className="mt-4">
                  <label
                    htmlFor="reason-input"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    เหตุผลสำหรับการเข้างานนอกสถานที่
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
                  onClick={handleCheckIn}
                  disabled={loading || (!inPremises && !reason)}
                  className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300 disabled:bg-gray-400"
                  aria-label={loading ? 'กำลังลงเวลาเข้างาน' : 'ลงเวลาเข้างาน'}
                >
                  {loading ? 'กำลังลงเวลาเข้างาน...' : 'ลงเวลาเข้างาน'}
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

export default GeneralCheckInForm;
