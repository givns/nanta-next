import React, { useEffect, useCallback, useState } from 'react';
import { useAtom } from 'jotai';
import { attendanceAtom, locationAtom } from './atoms';
import { AttendanceStatusInfo, LocationState } from '@/types/attendance';
import { EnhancedLocationService } from '@/services/EnhancedLocationService';

const CACHE_VERSION = '1';
const CACHE_TTL = 300; // 5 minutes

// Custom hook for managing location state
const useLocationOnce = () => {
  const [location, setLocation] = useAtom(locationAtom);
  const [error, setError] = useState<string | null>(null);

  const getCurrentLocation = useCallback(
    async (force = false) => {
      // If we already have location and not forcing, return existing
      if (location && !force) return location;

      try {
        const locationService = new EnhancedLocationService();
        const result = await locationService.getCurrentLocation();
        const newLocation: LocationState = {
          inPremises: result.inPremises,
          address: result.address,
          confidence: result.confidence,
          coordinates: result.coordinates,
          accuracy: result.accuracy,
        };
        setLocation(newLocation);
        return newLocation;
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Failed to get location',
        );
        return null;
      }
    },
    [location, setLocation],
  );

  return { location, getCurrentLocation, error };
};

// Optimized hook for attendance status
const useAttendanceStatus = (employeeId: string, lineUserId: string | null) => {
  const [status, setStatus] = useAtom(attendanceAtom);
  const { location } = useLocationOnce();
  const [lastFetch, setLastFetch] = useState<Date>();

  const fetchStatus = useCallback(
    async (force = false) => {
      // Check if we need to fetch
      if (!force && status && lastFetch) {
        const timeSinceLastFetch = Date.now() - lastFetch.getTime();
        if (timeSinceLastFetch < CACHE_TTL * 1000) return status;
      }

      try {
        const response = await fetch('/api/attendance-status', {
          headers: {
            'x-line-userid': lineUserId || '',
            'x-employee-id': employeeId,
            'x-location': JSON.stringify(location),
            'x-cache-version': CACHE_VERSION,
          },
        });

        if (!response.ok) throw new Error('Failed to fetch status');

        const data = await response.json();
        setStatus(data);
        setLastFetch(new Date());
        return data;
      } catch (error) {
        console.error('Error fetching attendance status:', error);
        throw error;
      }
    },
    [employeeId, lineUserId, location, status, lastFetch, setStatus],
  );

  return {
    status,
    refetch: fetchStatus,
    lastUpdated: lastFetch,
  };
};

export const AttendanceTracker: React.FC<{
  employeeId: string;
  lineUserId: string | null;
  onError?: (error: Error) => void;
}> = ({ employeeId, lineUserId, onError }) => {
  const { status, refetch } = useAttendanceStatus(employeeId, lineUserId);
  const { getCurrentLocation } = useLocationOnce();

  // Initial setup
  useEffect(() => {
    const initialize = async () => {
      try {
        await getCurrentLocation();
        await refetch(true);
      } catch (error) {
        onError?.(
          error instanceof Error ? error : new Error('Initialization failed'),
        );
      }
    };

    initialize();
  }, []);

  return (
    <div className="space-y-4">
      {status ? (
        <>
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-2">Attendance Status</h2>
            <p className="text-gray-700">
              Status: {status.state} ({status.checkStatus})
            </p>
            {status.currentPeriod && (
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  Current Period: {status.currentPeriod.type}
                </p>
                <p className="text-sm text-gray-600">
                  Check In:{' '}
                  {status.currentPeriod.checkInTime || 'Not checked in'}
                </p>
                <p className="text-sm text-gray-600">
                  Check Out:{' '}
                  {status.currentPeriod.checkOutTime || 'Not checked out'}
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-4">Loading attendance status...</div>
      )}
    </div>
  );
};

export default AttendanceTracker;
