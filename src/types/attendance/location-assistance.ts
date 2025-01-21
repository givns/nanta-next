// types/location-assistance.ts

import { User } from '@prisma/client';

/**
 * Status of a location assistance request
 */
export type LocationAssistanceStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Source of the location request
 */
export type LocationRequestSource = 'mobile-app' | 'web' | 'manual';

/**
 * Represents coordinates with accuracy
 */
export interface LocationCoordinates {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * Metadata for location requests
 */
export interface LocationRequestMetadata {
  source: LocationRequestSource;
  version: string;
  device?: {
    platform?: string;
    model?: string;
  };
  [key: string]: any;
}

/**
 * Input for creating a location assistance request
 */
export interface LocationAssistanceCreateInput {
  employeeId: string;
  coordinates?: LocationCoordinates;
  address?: string;
  accuracy: number;
  reason?: string;
  source?: LocationRequestSource;
  metadata?: LocationRequestMetadata;
}

export interface LocationRequestInput {
  requestId: string;
  employeeId: string;
  employeeName: string;
  coordinates: LocationCoordinates | null;
  address: string | null;
  reason: string;
}

/**
 * Input for verifying a location assistance request
 */
export interface LocationAssistanceVerificationInput {
  verificationNote: string;
  verifiedBy: string;
  verifiedAt?: Date;
}

/**
 * Input for rejecting a location assistance request
 */
export interface LocationAssistanceRejectionInput {
  rejectionReason: string;
  verifiedBy: string;
  verifiedAt?: Date;
}

/**
 * Response for a location request verification
 */
export interface LocationVerificationResponse {
  success: boolean;
  message: string;
  data?: {
    verifiedAt: Date;
    verifiedBy: string;
    verificationNote?: string;
    rejectionReason?: string;
  };
}

/**
 * Full location assistance request object
 */
export interface LocationAssistanceRequest {
  id: string;
  employeeId: string;
  requestedAt: Date;
  coordinates: LocationCoordinates | null;
  address: string | null;
  accuracy: number;
  status: LocationAssistanceStatus;
  reason: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  verificationNote: string | null;
  rejectionReason: string | null;
  source: LocationRequestSource | null;
  metadata: LocationRequestMetadata | null;
  createdAt: Date;
  updatedAt: Date;

  // Relations (optional)
  employee?: User;
  verifier?: User;
}

/**
 * Admin notification for location requests
 */
export interface LocationAssistanceNotificationData {
  adminLineId: string;
  requestId: string;
  employeeId: string;
  employeeName: string;
  coordinates: LocationCoordinates | null;
  address: string | null;
  reason: string;
}

/**
 * Location verification result notification
 */
export interface LocationVerificationResultData {
  lineUserId: string;
  status: LocationAssistanceStatus;
  verificationNote?: string;
  reason?: string;
}
