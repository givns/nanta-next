// utils/locationUtils.ts
import { Location } from '@/types/attendance/base';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: Date;
  provider?: string;
}

export function toLocation(geoLocation: GeoLocation): Location {
  return {
    lat: geoLocation.latitude,
    lng: geoLocation.longitude,
    accuracy: geoLocation.accuracy,
    timestamp: geoLocation.timestamp,
    provider: geoLocation.provider,
    longitude: geoLocation.longitude,
    latitude: geoLocation.latitude,
  };
}

export function toGeoLocation(location: Location): GeoLocation {
  return {
    latitude: location.lat,
    longitude: location.lng,
    accuracy: location.accuracy,
    timestamp: location.timestamp,
    provider: location.provider,
  };
}

export function normalizeLocation(
  location: Partial<Location> | undefined,
): Location | undefined {
  if (!location) return undefined;

  // Get primary coordinates
  const lat = location.lat ?? location.latitude;
  const lng = location.lng ?? location.longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return undefined;
  }

  return {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    accuracy: location.accuracy,
    timestamp: location.timestamp,
    provider: location.provider,
  };
}
