import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { saveData } from '../services/SyncService';
import GoogleMapComponent from './GoogleMap';
import Webcam from 'react-webcam';
import { Loader } from '@googlemaps/js-api-loader';
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
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [photo, setPhoto] = useState<string | null>(null);
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);
  const [inPremises, setInPremises] = useState<boolean>(false);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

  useEffect(() => {
    const loader = new Loader({
      apiKey: process.env.GOOGLE_MAPS_API as string,
      version: 'weekly',
      libraries: ['places', 'geometry'],
    });

    loader.load().then(() => {
      setGeocoder(new google.maps.Geocoder());
    });

    const fetchUserDetails = async () => {
      try {
        console.log('Fetching user details for LINE User ID:', lineUserId);
        const response = await axios.get(`/api/user/${lineUserId}`);
        console.log('User details response:', response.data);
        setUserId(response.data.id);
        setRole(response.data.role);
        // Set other user details as needed
      } catch (error) {
        console.error('Error fetching user details:', error);
        if (axios.isAxiosError(error)) {
          if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            setError(
              `Unable to fetch user details. Server responded with: ${error.response.status}`,
            );
          } else if (error.request) {
            console.error('No response received:', error.request);
            setError(
              'Unable to fetch user details. No response received from server.',
            );
          } else {
            console.error('Error message:', error.message);
            setError(`Unable to fetch user details. Error: ${error.message}`);
          }
        } else {
          setError('An unexpected error occurred while fetching user details.');
        }
      }
    };

    const getCurrentLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const currentLocation = { lat: latitude, lng: longitude };
            setLocation(currentLocation);

            // Check if the user is within any of the premises
            const isInPremises = PREMISES.some(
              (premise) =>
                google.maps.geometry.spherical.computeDistanceBetween(
                  new google.maps.LatLng(currentLocation),
                  new google.maps.LatLng(premise),
                ) <= premise.radius,
            );
            setInPremises(isInPremises);

            // Reverse geocoding
            if (geocoder) {
              try {
                const result = await geocoder.geocode({
                  location: currentLocation,
                });
                if (result.results && result.results.length > 0) {
                  setAddress(result.results[0].formatted_address);
                } else {
                  setAddress('Address not found');
                }
              } catch (error) {
                console.error('Geocoder failed due to: ' + error);
                setAddress('Error fetching address');
              }
            }
          },
          (error) => {
            console.error('Error getting current location:', error);
            setError('Unable to get current location. Please try again.');
          },
        );
      }
    };

    fetchUserDetails();
    getCurrentLocation();
  }, [lineUserId, geocoder]);

  const handleNextStep = () => {
    setStep(step + 1);
  };

  const capturePhoto = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setPhoto(imageSrc);
      handleNextStep();
    }
  };

  const handleCheckIn = async () => {
    if (!userId || !role || !location || !photo) {
      setError('User ID, role, location, and photo are required for check-in.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = {
        userId,
        role,
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
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${(step / 3) * 100}%` }}
          ></div>
          ระบบบันทึกเวลาทำงาน
        </h5>
        <div className="space-y-6">
          <div className="flex justify-between">
            <span>Step {step}/3</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
          {step === 1 && (
            <div>
              <p>ชื่อ นามสกุล: {userName}</p>
              <p>แผนก: {department}</p>
              <button
                onClick={handleNextStep}
                className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
              >
                Next
              </button>
            </div>
          )}
          {step === 2 && (
            <div>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-auto mb-4"
              />

              <button
                onClick={capturePhoto}
                className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
              >
                Take Photo
              </button>
            </div>
          )}
          {step === 3 && (
            <div>
              <div className="mb-3">
                <label
                  htmlFor="address"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  ที่อยู่ของคุณ
                </label>
                <div
                  id="address"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                >
                  {address}
                </div>
              </div>
              {location && <GoogleMapComponent center={location} />}
              {!inPremises && (
                <div className="mb-3 mt-5">
                  <label
                    htmlFor="reason"
                    className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                  >
                    เหตุผลสำหรับการเข้างานนอกสถานที่
                  </label>
                  <input
                    type="text"
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                    required
                  />
                </div>
              )}
              <div className="flex justify-end mt-5">
                <button
                  onClick={handleCheckIn}
                  disabled={loading || (!inPremises && !reason)}
                  className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                >
                  {loading ? 'กำลังลงเวลาเข้างาน...' : 'ลงเวลาเข้างาน'}
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-danger text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
};
export default GeneralCheckInForm;
