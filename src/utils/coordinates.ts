// utils/coordinates.ts
import { Prisma } from '@prisma/client';
import { LocationCoordinates } from '@/types/attendance';

export function serializeCoordinates(
  coords: LocationCoordinates | null,
): Prisma.JsonValue {
  if (!coords) return null;
  // Convert to a plain object that Prisma can handle
  return {
    lat: coords.lat,
    lng: coords.lng,
    ...(coords.accuracy && { accuracy: coords.accuracy }),
  } as Prisma.JsonValue;
}

export function deserializeCoordinates(
  jsonValue: Prisma.JsonValue | null,
): LocationCoordinates | null {
  if (!jsonValue || typeof jsonValue !== 'object') return null;
  const coords = jsonValue as Record<string, any>;
  if (!coords.lat || !coords.lng) return null;

  return {
    lat: Number(coords.lat),
    lng: Number(coords.lng),
    ...(coords.accuracy && { accuracy: Number(coords.accuracy) }),
  };
}
