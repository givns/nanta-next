// schemas/location-assistance.ts
import { z } from 'zod';

export const LocationCoordinatesSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
});

export const LocationRequestMetadataSchema = z
  .object({
    source: z.enum(['mobile-app', 'web', 'manual'] as const),
    version: z.string(),
    device: z
      .object({
        platform: z.string().optional(),
        model: z.string().optional(),
      })
      .optional(),
  })
  .passthrough(); // Allow additional properties

export const LocationAssistanceCreateSchema = z.object({
  employeeId: z.string(),
  coordinates: LocationCoordinatesSchema.optional(),
  address: z.string().optional(),
  accuracy: z.number(),
  reason: z.string().optional(),
  source: z.enum(['mobile-app', 'web', 'manual'] as const).optional(),
  metadata: LocationRequestMetadataSchema.optional(),
});

export const LocationAssistanceVerificationSchema = z.object({
  verificationNote: z.string(),
  verifiedBy: z.string(),
  verifiedAt: z.date().optional(),
});

export const LocationAssistanceRejectionSchema = z.object({
  rejectionReason: z.string(),
  verifiedBy: z.string(),
  verifiedAt: z.date().optional(),
});

// API Request Schemas
export const CreateLocationAssistanceRequestSchema = z.object({
  employeeId: z.string(),
  coordinates: LocationCoordinatesSchema.optional(),
  address: z.string().optional(),
  accuracy: z.number(),
  timestamp: z.string().datetime(),
  reason: z.string().optional(),
  source: z.enum(['mobile-app', 'web', 'manual'] as const).optional(),
  metadata: LocationRequestMetadataSchema.optional(),
});

export const UpdateLocationAssistanceRequestSchema = z.object({
  requestId: z.string(),
  status: z.enum(['APPROVED', 'REJECTED'] as const),
  verificationNote: z.string().optional(),
  rejectionReason: z.string().optional(),
  verifiedBy: z.string(),
});

// Helper function to validate location assistance request creation
export const validateLocationAssistanceCreate = (data: unknown) => {
  return CreateLocationAssistanceRequestSchema.parse(data);
};

// Helper function to validate location assistance request update
export const validateLocationAssistanceUpdate = (data: unknown) => {
  return UpdateLocationAssistanceRequestSchema.parse(data);
};
