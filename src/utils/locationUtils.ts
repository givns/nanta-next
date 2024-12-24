// utils/locationUtils.ts

import { GeoLocation, GeoLocationJson, Location } from '@/types/attendance';

export function toLocation(geoLocation: GeoLocation): Location {
  return {
    latitude: geoLocation.latitude,
    longitude: geoLocation.longitude,
    lat: geoLocation.lat,
    lng: geoLocation.lng,
    accuracy: geoLocation.accuracy,
    timestamp: geoLocation.timestamp,
    provider: geoLocation.provider,
  };
}

export function toGeoLocation(location: Location): GeoLocation {
  return {
    lat: location.lat,
    lng: location.lng,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    timestamp: location.timestamp,
    provider: location.provider,
  };
}

export function toGeoLocationJson(
  location: Location | GeoLocation,
): GeoLocationJson {
  return {
    lat: location.lat,
    lng: location.lng,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    timestamp: location.timestamp?.toISOString(),
    provider: location.provider,
  };
}

export function fromGeoLocationJson(json: GeoLocationJson): GeoLocation {
  return {
    lat: json.lat,
    lng: json.lng,
    latitude: json.latitude,
    longitude: json.longitude,
    accuracy: json.accuracy,
    timestamp: json.timestamp ? new Date(json.timestamp) : undefined,
    provider: json.provider,
  };
}

export function normalizeLocation(
  location: Partial<Location> | undefined,
): Location | undefined {
  if (!location) return undefined;

  // Get primary coordinates
  const latitude = location.latitude ?? location.lat;
  const longitude = location.longitude ?? location.lng;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return undefined;
  }

  return {
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    accuracy: location.accuracy,
    timestamp: location.timestamp,
    provider: location.provider,
  };
}

// Helper function to validate location data
export function isValidLocation(location: any): location is Location {
  return (
    location &&
    typeof location === 'object' &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    typeof location.lat === 'number' &&
    typeof location.lng === 'number' &&
    (!location.accuracy || typeof location.accuracy === 'number') &&
    (!location.timestamp || location.timestamp instanceof Date) &&
    (!location.provider || typeof location.provider === 'string')
  );
}

// Helper to check if coordinates are within valid ranges
export function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// Helper to format location for display
export function formatLocation(location: Location): string {
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}
