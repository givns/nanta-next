import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';
import Map from '../components/GoogleMap';
import { getAddressFromCoordinates } from '../utils/geocoding';

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

const CheckpointPage: React.FC = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [checkpointName, setCheckpointName] = useState<string>('');
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const checkUserStatus = useCallback(async () => {
    try {
      const response = await axios.get('/api/userStatus');
      if (!response.data.isCheckedIn) {
        router.push('/check-in');
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      setError('Failed to check user status. Please try again.');
    }
  }, [router]);

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

  useEffect(() => {
    checkUserStatus();
  }, [checkUserStatus]);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Error initializing LIFF:', error);
        setError('Failed to initialize LIFF. Please try again.');
      }
    };

    initializeLiff();
  }, [router]);

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
              setAddress(premise.name);
            } else {
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

  const handleAddCheckpoint = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!lineUserId || !location) {
        throw new Error('Missing user ID or location data');
      }

      await axios.post('/api/addCheckpoint', {
        lineUserId,
        latitude: location.lat,
        longitude: location.lng,
        address,
        checkpointName,
      });

      setCheckpoints([...checkpoints, checkpointName]);
      setCheckpointName('');
    } catch (error) {
      console.error('Failed to add checkpoint:', error);
      setError('Failed to add checkpoint. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToCheckout = () => {
    router.push('/check-out');
  };

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!location) {
    return <div>Loading location...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Driver Checkpoints</h1>
      <Map center={location} />
      <p className="my-4">Current Address: {address}</p>
      <div className="mb-4">
        <input
          type="text"
          value={checkpointName}
          onChange={(e) => setCheckpointName(e.target.value)}
          placeholder="Enter checkpoint name"
          className="w-full p-2 border rounded"
        />
      </div>
      <button
        onClick={handleAddCheckpoint}
        disabled={loading || !checkpointName}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
      >
        {loading ? 'Adding...' : 'Add Checkpoint'}
      </button>
      <button
        onClick={handleProceedToCheckout}
        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
      >
        Proceed to Check-Out
      </button>
      <div className="mt-4">
        <h2 className="text-xl font-bold">Checkpoints:</h2>
        <ul className="list-disc pl-5">
          {checkpoints.map((checkpoint, index) => (
            <li key={index}>{checkpoint}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CheckpointPage;
