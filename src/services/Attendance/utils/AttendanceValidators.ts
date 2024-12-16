// services/Attendance/utils/AttendanceValidators.ts

import { AttendanceState } from '@prisma/client';
import {
  ValidationResult,
  ValidationError,
  ProcessingOptions,
  Location,
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
    if (options.isOvertime && !options.overtimeRequestId) {
      errors.push({
        code: 'INVALID_OVERTIME',
        message: 'Overtime request ID is required for overtime attendance',
        severity: 'error',
        timestamp: new Date(),
      });
    }

    // Location validation if provided
    if (options.location) {
      const locationErrors = this.validateLocation(options.location);
      errors.push(...locationErrors);
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

  static validateLocation(location: Location): ValidationError[] {
    const errors: ValidationError[] = [];

    if (
      typeof location.lat !== 'number' ||
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

    if (
      typeof location.lng !== 'number' ||
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

    return errors;
  }

  /** @deprecated Use validateProcessingOptions instead */
  static validateAttendanceInput(input: any): ValidationResult {
    return this.validateProcessingOptions(input);
  }
}
