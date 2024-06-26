import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { saveData } from '../services/SyncService';
import GoogleMapComponent from './GoogleMap';
import Webcam from 'react-webcam';

interface GeneralCheckInFormProps {
  lineUserId: string;
}

const GeneralCheckInForm: React.FC<GeneralCheckInFormProps> = ({
  lineUserId,
}) => {
  const [userId, setUserId] = useState<string | null>(null);
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
  const [inGeofence, setInGeofence] = useState<boolean>(true);
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        const response = await axios.get(`/api/user/${lineUserId}`);
        setUserId(response.data.id);
        setRole(response.data.role);
      } catch (error) {
        console.error('Error fetching user details:', error);
        setError('Unable to fetch user details. Please try again.');
      }
    };

    const getCurrentLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setLocation({ lat: latitude, lng: longitude });
            // Mock geofencing check
            const isInGeofence = true; // Replace with actual geofencing logic
            setInGeofence(isInGeofence);
            setAddress('Mock Address from Geocoding API'); // Replace with actual geocoding result
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
  }, [lineUserId]);

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
          General Employee Check-In
        </h5>
        <div className="space-y-6">
          <div className="flex justify-between">
            <span>Step {step}/3</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
          {step === 1 && (
            <div>
              <p>Name: John Doe</p>
              <p>Department: HR</p>
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
                  Current Address
                </label>
                <div
                  id="address"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                >
                  {address}
                </div>
              </div>
              {location && <GoogleMapComponent center={location} />}
              {!inGeofence && (
                <div className="mb-3">
                  <label
                    htmlFor="reason"
                    className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                  >
                    Reason for being outside the premises
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
              <button
                onClick={handleCheckIn}
                disabled={loading || (!inGeofence && !reason)}
                className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
              >
                {loading ? 'Checking In...' : 'Check In'}
              </button>
            </div>
          )}
          {error && <p className="text-danger text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default GeneralCheckInForm;
