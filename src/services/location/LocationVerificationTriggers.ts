// services/location/LocationVerificationTriggers.ts

import { LocationState, LocationVerificationState } from '@/types/attendance';

export interface LocationTriggerConfig {
  maxAccuracy: number; // Maximum acceptable accuracy in meters
  maxRetries: number; // Maximum number of location fetch retries
  maxWaitTime: number; // Maximum wait time in milliseconds
  minDistance: number; // Minimum distance from workplace in meters
  workplaceCoordinates: {
    lat: number;
    lng: number;
  }[]; // Array of valid workplace coordinates
  errorHandling?: {
    allowAdminOverride: boolean; // Allow admin to override location errors
    retryOnError: boolean; // Auto retry on certain errors
    deviceSpecific?: {
      // Device-specific handling
      ios: boolean; // Special handling for iOS devices
      android: boolean; // Special handling for Android devices
    };
  };
}

export class LocationVerificationTriggers {
  private retryCount = 0;
  private startTime: number;
  private lockedState: LocationVerificationState | null = null;

  constructor(private config: LocationTriggerConfig) {
    this.startTime = Date.now();
  }

  lockApprovedState(state: LocationVerificationState) {
    this.lockedState = state;

    // Automatically clear the locked state after some time (e.g., 5 minutes)
    setTimeout(
      () => {
        this.lockedState = null;
      },
      5 * 60 * 1000,
    );
  }

  getLockedState(): LocationVerificationState | null {
    return this.lockedState;
  }

  // Add method to clear locked state
  clearLockedState() {
    this.lockedState = null;
  }

  shouldTriggerAdminAssistance(locationState: LocationState): {
    shouldTrigger: boolean;
    reason: string;
  } {
    if (locationState instanceof GeolocationPositionError) {
      return {
        shouldTrigger: true,
        reason:
          locationState.code === GeolocationPositionError.PERMISSION_DENIED
            ? 'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น'
            : 'ไม่สามารถระบุตำแหน่งได้',
      };
    }
    // No location services
    if (locationState.error?.includes('location services disabled')) {
      return {
        shouldTrigger: true,
        reason: 'Location services are disabled on the device',
      };
    }

    // Location permission denied
    if (locationState.error?.includes('permission denied')) {
      return {
        shouldTrigger: true,
        reason: 'Location permission was denied',
      };
    }

    // Poor accuracy
    if (locationState.accuracy > this.config.maxAccuracy) {
      return {
        shouldTrigger: true,
        reason: `Location accuracy (${Math.round(locationState.accuracy)}m) exceeds maximum allowed (${this.config.maxAccuracy}m)`,
      };
    }

    // Too many retries
    if (this.retryCount >= this.config.maxRetries) {
      return {
        shouldTrigger: true,
        reason: `Location verification failed after ${this.config.maxRetries} attempts`,
      };
    }

    // Wait time exceeded
    if (Date.now() - this.startTime > this.config.maxWaitTime) {
      return {
        shouldTrigger: true,
        reason: 'Location verification timeout exceeded',
      };
    }

    // Location too far from workplace
    if (locationState.coordinates) {
      const nearestWorkplace = this.findNearestWorkplace(
        locationState.coordinates,
      );
      if (nearestWorkplace.distance > this.config.minDistance) {
        return {
          shouldTrigger: true,
          reason: `Location (${Math.round(nearestWorkplace.distance)}m) exceeds maximum allowed distance from workplace (${this.config.minDistance}m)`,
        };
      }
    }

    return {
      shouldTrigger: false,
      reason: '',
    };
  }

  incrementRetry() {
    this.retryCount++;
  }

  private findNearestWorkplace(coordinates: { lat: number; lng: number }) {
    let minDistance = Number.MAX_VALUE;
    let nearest = this.config.workplaceCoordinates[0];

    for (const workplace of this.config.workplaceCoordinates) {
      const distance = this.calculateDistance(
        coordinates.lat,
        coordinates.lng,
        workplace.lat,
        workplace.lng,
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = workplace;
      }
    }

    return {
      coordinates: nearest,
      distance: minDistance,
    };
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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
  }
}
