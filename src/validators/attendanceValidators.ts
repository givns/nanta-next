// validators/attendanceValidators.ts
import { z } from 'zod';
import { AttendanceStatusInfoSchema } from '../schemas/attendance';
import { isAttendanceStatusValue } from '../utils/typeGuards';

export const validateAttendanceStatus = (data: unknown) => {
  const result = AttendanceStatusInfoSchema.safeParse(data);

  if (!result.success) {
    console.error('Validation errors:', result.error);
    throw new Error('Invalid attendance data');
  }

  // Additional runtime validation
  if (result.data.status && !isAttendanceStatusValue(result.data.status)) {
    throw new Error(`Invalid attendance status: ${result.data.status}`);
  }

  return result.data;
};
