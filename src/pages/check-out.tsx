import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';
import { locationTrackingService } from '../services/locationTrackingService';
import Map from '../components/Map';
import { getAddressFromCoordinates } from '../utils/geocoding';

const CheckOutPage: React.FC = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
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
      try {
        const currentLocation =
          await locationTrackingService.getCurrentLocation();
        setLocation({
          lat: currentLocation.latitude,
          lng: currentLocation.longitude,
        });
        const addressFromCoords = await getAddressFromCoordinates(
          currentLocation.latitude,
          currentLocation.longitude,
        );
        setAddress(addressFromCoords);
      } catch (error) {
        console.error('Error getting current location:', error);
        setError('Unable to get current location. Please try again.');
      }
    };

    getCurrentLocation();
  }, []);

  const handleCheckOut = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!lineUserId || !location) {
        throw new Error('Missing user ID or location data');
      }

      await locationTrackingService.stopTracking();

      await axios.post('/api/checkOut', {
        lineUserId,
        latitude: location.lat,
        longitude: location.lng,
        address,
      });

      setTimeout(() => {
        liff.closeWindow();
        router.push('/checkin');
      }, 2000); // Close after 2 seconds
    } catch (error) {
      console.error('Check-out failed:', error);
    }
  };

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!location) {
    return <div>Loading location...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Driver Check-Out</h1>
      <Map center={location} />
      <p className="my-4">Current Address: {address}</p>
      <button
        onClick={handleCheckOut}
        disabled={loading}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        {loading ? 'Checking Out...' : 'Check Out'}
      </button>
    </div>
  );
};

export default CheckOutPage;
