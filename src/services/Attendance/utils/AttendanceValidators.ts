// services/Attendance/utils/AttendanceValidators.ts

import { AttendanceState } from '@prisma/client';
import {
  ValidationResult,
  ValidationError,
  ProcessingOptions,
  GeoLocation,
} from '../../../types/attendance';

export class AttendanceValidators {
  static validateProcessingOptions(
    options: ProcessingOptions,
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // Required fields
    if (!options.employeeId && !options.lineUserId) {
      errors.push({
        code: 'INVALID_INPUT',
        message: 'Either employeeId or lineUserId is required',
        severity: 'error',
        timestamp: new Date(),
      });
    }

    if (!options.checkTime) {
      errors.push({
        code: 'INVALID_INPUT',
        message: 'Check time is required',
        severity: 'error',
        timestamp: new Date(),
      });
    }

    // Overtime validation
    if (options.activity.isOvertime && !options.metadata?.overtimeId) {
      errors.push({
        code: 'INVALID_OVERTIME',
        message: 'Overtime request ID is required for overtime attendance',
        severity: 'error',
        timestamp: new Date(),
      });
    }

    // Location validation if provided
    if (options.location?.coordinates) {
      // Create a GeoLocation object with all required fields
      const geoLocation: GeoLocation = {
        lat: options.location.coordinates.lat,
        lng: options.location.coordinates.lng,
        accuracy: options.location.coordinates.accuracy,
        timestamp: options.location.coordinates.timestamp,
        provider: options.location.coordinates.provider,
      };

      // Only validate if we have both coordinates
      if (
        typeof geoLocation.lat === 'number' &&
        typeof geoLocation.lng === 'number'
      ) {
        const locationErrors = this.validateLocation(geoLocation);
        errors.push(...locationErrors);
      } else {
        // Push error if coordinates are missing or invalid
        errors.push({
          code: 'INVALID_COORDINATES',
          message: 'Invalid or missing coordinates',
          severity: 'error',
          timestamp: new Date(),
        });
      }
    }

    return {
      isValid: errors.length === 0,
      state: AttendanceState.INCOMPLETE,
      errors,
      warnings: [],
      metadata: {
        lastValidated: new Date(),
        validatedBy: 'system',
        rules: ['input', 'overtime', 'location'],
      },
    };
  }

  static validateLocation(location: GeoLocation): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate latitude
    if (
      typeof location.lat !== 'number' ||
      isNaN(location.lat) ||
      location.lat < -90 ||
      location.lat > 90
    ) {
      errors.push({
        code: 'INVALID_LATITUDE',
        message: 'Invalid latitude value',
        severity: 'error',
        timestamp: new Date(),
      });
    }

    // Validate longitude
    if (
      typeof location.lng !== 'number' ||
      isNaN(location.lng) ||
      location.lng < -180 ||
      location.lng > 180
    ) {
      errors.push({
        code: 'INVALID_LONGITUDE',
        message: 'Invalid longitude value',
        severity: 'error',
        timestamp: new Date(),
      });
    }

    // Optional but if provided, validate accuracy
    if (
      location.accuracy !== undefined &&
      (typeof location.accuracy !== 'number' ||
        isNaN(location.accuracy) ||
        location.accuracy < 0)
    ) {
      errors.push({
        code: 'INVALID_ACCURACY',
        message: 'Invalid accuracy value',
        severity: 'error',
        timestamp: new Date(),
      });
    }
    {
      errors.push({
        code: 'INCONSISTENT_COORDINATES',
        message: 'Inconsistent coordinate values',
        severity: 'error',
        timestamp: new Date(),
      });
    }

    return errors;
  }
}
