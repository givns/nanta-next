// services/Attendance/AttendanceCheckService.ts
import { PrismaClient } from '@prisma/client';
import {
  UnifiedPeriodState,
  StateValidation,
  ShiftWindowResponse,
  ATTENDANCE_CONSTANTS,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  addMinutes,
  differenceInMinutes,
  isBefore,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { PeriodManagementService } from './PeriodManagementService';
import { AttendanceEnhancementService } from './AttendanceEnhancementService';
import { AttendanceStatusService } from './AttendanceStatusService'; // Add the missing import statement
import { CacheManager } from '../cache/CacheManager';
import { AttendanceRecordService } from './AttendanceRecordService';

export class AttendanceCheckService {
  private readonly statusService: AttendanceStatusService; // Declare the property
  constructor(
    private readonly shiftService: ShiftManagementService,
    private readonly periodManager: PeriodManagementService,
    private readonly enhancementService: AttendanceEnhancementService,
    cacheManager: CacheManager,
    attendanceRecordService: AttendanceRecordService,
  ) {
    this.statusService = new AttendanceStatusService( // Initialize the property
      shiftService,
      enhancementService,
      attendanceRecordService,
      cacheManager,
    );
  }

  async validateAttendanceState(
    employeeId: string,
    options: {
      inPremises: boolean;
      address: string;
      location?: Location;
    },
  ): Promise<StateValidation> {
    const now = getCurrentTime();

    // Get current state
    const [currentRecord, window] = await Promise.all([
      this.statusService.getLatestAttendanceRecord(employeeId),
      this.shiftService.getCurrentWindow(employeeId, now),
    ]);

    if (!window) {
      return this.createStateValidation(false, 'No active window found');
    }

    // Get current period state
    const currentState = this.periodManager.resolveCurrentPeriod(
      currentRecord,
      window,
      now,
    );

    // Check location validation
    const locationValid = await this.validateLocation(
      options.inPremises,
      options.location,
      options.address,
    );

    // Get pending transitions
    const transitions = this.periodManager.calculatePeriodTransitions(
      currentState,
      window,
      now,
    );

    // Validate period state
    const periodValidation = await this.validatePeriodState(
      currentState,
      window,
      now,
    );

    return {
      allowed: locationValid.isValid && periodValidation.isValid,
      reason: locationValid.isValid
        ? periodValidation.message
        : locationValid.message,
      flags: {
        hasActivePeriod: currentState.activity.isActive,
        isInsideShift: currentState.validation.isWithinBounds,
        isOutsideShift:
          currentState.activity.isActive &&
          !currentState.validation.isWithinBounds,
        isEarlyCheckIn: periodValidation.validationFlags.isEarly,
        isLateCheckIn: periodValidation.validationFlags.isLate,
        isEarlyCheckOut: periodValidation.validationFlags.isEarlyCheckout,
        isVeryLateCheckOut: false,
        isOvertime: currentState.activity.isOvertime,
        isPendingOvertime: Boolean(window.nextPeriod?.type === 'OVERTIME'),
        isDayOffOvertime: currentState.activity.isDayOffOvertime,
        hasPendingTransition: transitions.length > 0,
        isAutoCheckIn: false,
        isAutoCheckOut: false,
        isAfternoonShift: false,
        isMorningShift: false,
        isAfterMidshift: false,
        isApprovedEarlyCheckout: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        requiresAutoCompletion: false,
        isHoliday: window.isHoliday,
        isDayOff: window.isDayOff,
        isManualEntry: false,
        isLateCheckOut: false,
        requiresTransition: false,
      },
      metadata: {
        nextTransitionTime: transitions[0]?.transitionTime,
        requiredAction:
          transitions.length > 0 ? 'Transition required' : undefined,
        additionalInfo: {
          locationMessage: locationValid.message,
          periodMessage: periodValidation.message,
        },
      },
    };
  }

  private async validateLocation(
    inPremises: boolean,
    location?: Location,
    address?: string,
  ): Promise<{ isValid: boolean; message: string }> {
    if (!inPremises) {
      return {
        isValid: false,
        message: 'Not in premises',
      };
    }

    return {
      isValid: true,
      message: 'Location valid',
    };
  }

  private async validatePeriodState(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): Promise<{
    isValid: boolean;
    message: string;
    validationFlags: {
      isEarly: boolean;
      isLate: boolean;
      isEarlyCheckout: boolean;
      isVeryEarlyCheckout: boolean;
    };
  }> {
    const checkTime = {
      isEarly: this.isEarlyForPeriod(now, currentState),
      isLate: this.isLateForPeriod(now, currentState),
      isEarlyCheckout: this.isEarlyCheckout(now, currentState),
      isVeryEarlyCheckout: this.isVeryEarlyCheckout(now, currentState),
    };

    if (checkTime.isVeryEarlyCheckout) {
      return {
        isValid: false,
        message: 'Cannot checkout too early. Please contact HR.',
        validationFlags: checkTime,
      };
    }

    if (checkTime.isEarlyCheckout) {
      return {
        isValid: false,
        message: 'Early checkout requires approval',
        validationFlags: checkTime,
      };
    }

    if (checkTime.isEarly) {
      return {
        isValid: false,
        message: 'Too early to check in',
        validationFlags: checkTime,
      };
    }

    return {
      isValid: true,
      message: '',
      validationFlags: checkTime,
    };
  }

  private isEarlyForPeriod(now: Date, state: UnifiedPeriodState): boolean {
    return isWithinInterval(now, {
      start: subMinutes(
        parseISO(state.timeWindow.start),
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      ),
      end: parseISO(state.timeWindow.start),
    });
  }

  private isLateForPeriod(now: Date, state: UnifiedPeriodState): boolean {
    return isWithinInterval(now, {
      start: parseISO(state.timeWindow.start),
      end: addMinutes(
        parseISO(state.timeWindow.start),
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
      ),
    });
  }

  private isEarlyCheckout(now: Date, state: UnifiedPeriodState): boolean {
    const endTime = parseISO(state.timeWindow.end);
    const earlyCheckoutTime = subMinutes(
      endTime,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
    );
    return isBefore(now, earlyCheckoutTime);
  }

  private isVeryEarlyCheckout(now: Date, state: UnifiedPeriodState): boolean {
    const midShift = addMinutes(
      parseISO(state.timeWindow.start),
      differenceInMinutes(
        parseISO(state.timeWindow.end),
        parseISO(state.timeWindow.start),
      ) / 2,
    );
    return isBefore(now, midShift);
  }

  private createStateValidation(
    allowed: boolean,
    reason: string,
  ): StateValidation {
    return {
      allowed,
      reason,
      flags: {
        hasActivePeriod: false,
        isInsideShift: false,
        isOutsideShift: false,
        isEarlyCheckIn: false,
        isLateCheckIn: false,
        isLateCheckOut: false,
        isVeryLateCheckOut: false,
        isOvertime: false,
        isPendingOvertime: false,
        isDayOffOvertime: false,
        hasPendingTransition: false,
        isAutoCheckIn: false,
        isAutoCheckOut: false,
        isAfternoonShift: false,
        isMorningShift: false,
        isAfterMidshift: false,
        isApprovedEarlyCheckout: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        requiresAutoCompletion: false,
        isHoliday: false,
        isDayOff: false,
        isManualEntry: false,
        isEarlyCheckOut: false,
        requiresTransition: false,
      },
    };
  }
}
