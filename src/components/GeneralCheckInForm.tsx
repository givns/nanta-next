import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { saveData } from '../services/SyncService';
import dynamic from 'next/dynamic';
import { Loader } from '@googlemaps/js-api-loader';
import debounce from 'lodash/debounce';
import Webcam from 'react-webcam';

const GoogleMapComponent = dynamic(() => import('./GoogleMap'), { ssr: false });
const WebcamWrapper = dynamic(() => import('./WebcamWrapper'), { ssr: false });
interface GeneralCheckInFormProps {
  lineUserId: string;
}

const PREMISES = [
  { lat: 13.50821, lng: 100.76405, radius: 100 },
  { lat: 13.51444, lng: 100.70922, radius: 100 },
];

const GeneralCheckInForm: React.FC<GeneralCheckInFormProps> = ({
  lineUserId,
}) => {
  const [userData, setUserData] = useState<{
    id: string;
    name: string;
    department: string;
    role: string;
  } | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [inPremises, setInPremises] = useState<boolean>(false);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);

  const fetchUserDetails = useCallback(async () => {
    try {
      const response = await axios.get(`/api/user/${lineUserId}`);
      setUserData(response.data);
    } catch (error) {
      console.error('Error fetching user details:', error);
      setError('Unable to fetch user details. Please try again.');
    }
  }, [lineUserId]);

  const debouncedSetLocation = useCallback(
    debounce((newLocation: { lat: number; lng: number }) => {
      setLocation(newLocation);
    }, 1000),
    [],
  );

  const getCurrentLocation = useCallback(async () => {
    if (navigator.geolocation && geocoder) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const currentLocation = { lat: latitude, lng: longitude };
          debouncedSetLocation(currentLocation);

          const isInPremises = PREMISES.some(
            (premise) =>
              google.maps.geometry.spherical.computeDistanceBetween(
                new google.maps.LatLng(currentLocation),
                new google.maps.LatLng(premise),
              ) <= premise.radius,
          );
          setInPremises(isInPremises);

          geocoder.geocode({ location: currentLocation }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              setAddress(results[0].formatted_address);
            } else {
              console.error('Geocoder failed due to: ' + status);
              setAddress('Error fetching address');
            }
          });
        },
        (error) => {
          console.error('Error getting current location:', error);
          setError('Unable to get current location. Please try again.');
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 },
      );
    }
  }, [geocoder, debouncedSetLocation]);

  useEffect(() => {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
      version: 'weekly',
      libraries: ['places', 'geometry'],
    });

    loader.load().then(() => {
      setGeocoder(new google.maps.Geocoder());
    });

    fetchUserDetails();
  }, [fetchUserDetails]);

  useEffect(() => {
    if (geocoder) {
      getCurrentLocation();
    }
  }, [getCurrentLocation, geocoder]);

  const capturePhoto = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = (webcamRef.current as any).getScreenshot();
      if (imageSrc) {
        setPhoto(imageSrc);
        setShowCamera(false);
        setStep(2);
      }
    }
  }, []);

  const handleCheckIn = useCallback(async () => {
    if (!userData?.id || !location || !photo) {
      setError('User ID, location, and photo are required for check-in.');
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
        reason,
        photo,
        timestamp: new Date().toISOString(),
      };

      await saveData('checkIn', data);

      alert('Check-in successful!');
      router.push('/checkpoint');
    } catch (error) {
      console.error('Check-in failed:', error);
      setError('Failed to check in. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userData, location, address, reason, photo, router]);

  if (!userData) {
    return <div>Loading user details...</div>;
  }

  return (
    <div className="main-container flex flex-col justify-center items-center h-screen bg-gray-100">
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
              <button
                onClick={() => setShowCamera(true)}
                className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
              >
                ถ่ายรูปเพื่อเช็คอิน
              </button>
            </div>
          )}
          {showCamera && (
            <div className="mt-4">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full rounded-lg"
              />
              <button
                onClick={capturePhoto}
                className="w-full mt-4 bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600 transition duration-300"
              >
                ถ่ายรูป
              </button>
            </div>
          )}
          {step === 2 && (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ที่อยู่ของคุณ
                </label>
                <div className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5">
                  {address || 'กำลังโหลดที่อยู่...'}
                </div>
              </div>
              {location && <GoogleMapComponent center={location} />}
              {!inPremises && (
                <div className="mt-4">
                  <label
                    htmlFor="reason"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    เหตุผลสำหรับการเข้างานนอกสถานที่
                  </label>
                  <input
                    type="text"
                    id="reason"
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
                >
                  {loading ? 'กำลังลงเวลาเข้างาน...' : 'ลงเวลาเข้างาน'}
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-red-500 mt-4">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default GeneralCheckInForm;
