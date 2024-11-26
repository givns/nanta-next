// Verify test environment
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Tests must be run in test environment');
}

import { PrismaClient, User } from '@prisma/client';
import {
  getCurrentTime,
  formatDate,
  toBangkokTime,
} from '../../src/utils/dateUtils';
import {
  AttendanceState,
  CheckStatus,
  PeriodType,
  ProcessingOptions,
} from '../../src/types/attendance';
import { cleanupTestData } from './cleanup';
import { AttendanceService } from '../../src/services/Attendance/AttendanceService';
import { initializeServices } from '../../src/services/ServiceInitializer';
import { setupTestEnvironment } from './setup';

const prisma = new PrismaClient();

class AttendanceTestSuite {
  private services: ReturnType<typeof initializeServices>;
  private attendanceService: AttendanceService;
  private testEmployee!: User;
  private currentDate!: Date;

  constructor() {
    // Will be initialized in initialize()
    this.services = {} as ReturnType<typeof initializeServices>;
    this.attendanceService = {} as AttendanceService;
  }

  async initialize() {
    await cleanupTestData();
    this.currentDate = getCurrentTime();

    // Use existing setup
    const setup = await setupTestEnvironment();
    this.services = setup.services;
    this.attendanceService = setup.attendanceService;
    this.testEmployee = setup.employee;
  }

  private getBaseProcessingOptions(
    isCheckIn: boolean,
    checkTime: string,
    additionalOptions: Partial<ProcessingOptions> = {},
  ): ProcessingOptions {
    return {
      employeeId: this.testEmployee.employeeId,
      lineUserId: undefined,
      checkTime: toBangkokTime(`${formatDate(this.currentDate)}T${checkTime}`),
      isCheckIn,
      location: {
        latitude: 13.736717,
        longitude: 100.523186,
        lat: 13.736717,
        lng: 100.523186,
        accuracy: 10,
      },
      address: 'Test Location',
      entryType: PeriodType.REGULAR,
      ...additionalOptions,
    };
  }

  private async validateAttendanceState(
    expectedState: AttendanceState,
    expectedCheckStatus: CheckStatus,
  ): Promise<boolean> {
    const status = await this.attendanceService.getLatestAttendanceStatus(
      this.testEmployee.employeeId,
    );

    return (
      status.state === expectedState &&
      status.checkStatus === expectedCheckStatus
    );
  }

  // Test Scenarios
  async testRegularAttendance() {
    console.log('\nTesting Regular Attendance Scenario');

    try {
      // Check In
      console.log('Step 1: Regular Check-in at 08:00');
      const checkInResult = await this.attendanceService.processAttendance(
        this.getBaseProcessingOptions(true, '08:00'),
      );

      if (!checkInResult.success) {
        throw new Error(`Check-in failed: ${checkInResult.errors}`);
      }

      const checkInValidation = await this.validateAttendanceState(
        AttendanceState.PRESENT,
        CheckStatus.CHECKED_IN,
      );

      console.log(
        `Check-in validation: ${checkInValidation ? 'PASSED' : 'FAILED'}`,
      );

      // Check Out
      console.log('Step 2: Regular Check-out at 17:00');
      const checkOutResult = await this.attendanceService.processAttendance(
        this.getBaseProcessingOptions(false, '17:00'),
      );

      if (!checkOutResult.success) {
        throw new Error(`Check-out failed: ${checkOutResult.errors}`);
      }

      const checkOutValidation = await this.validateAttendanceState(
        AttendanceState.PRESENT,
        CheckStatus.CHECKED_OUT,
      );

      console.log(
        `Check-out validation: ${checkOutValidation ? 'PASSED' : 'FAILED'}`,
      );

      return checkInValidation && checkOutValidation;
    } catch (error) {
      console.error('Regular attendance test failed:', error);
      return false;
    }
  }

  async testOvertimeAttendance() {
    console.log('\nTesting Overtime Attendance Scenario');

    try {
      // Create overtime request
      const overtimeRequest = await prisma.overtimeRequest.create({
        data: {
          employeeId: this.testEmployee.employeeId,
          name: this.testEmployee.name,
          date: this.currentDate,
          startTime: '17:00',
          endTime: '20:00',
          status: 'approved',
          isDayOffOvertime: false,
          isInsideShiftHours: false,
          durationMinutes: 180,
        },
      });

      // Regular Check-in
      console.log('Step 1: Regular Check-in at 08:00');
      await this.attendanceService.processAttendance(
        this.getBaseProcessingOptions(true, '08:00'),
      );

      // Regular Check-out
      console.log('Step 2: Regular Check-out at 17:00');
      await this.attendanceService.processAttendance(
        this.getBaseProcessingOptions(false, '17:00'),
      );

      // Overtime Check-in
      console.log('Step 3: Overtime Check-in at 17:00');
      await this.attendanceService.processAttendance(
        this.getBaseProcessingOptions(true, '17:00', {
          isOvertime: true,
          overtimeRequestId: overtimeRequest.id,
          entryType: PeriodType.OVERTIME,
        }),
      );

      // Overtime Check-out
      console.log('Step 4: Overtime Check-out at 20:00');
      await this.attendanceService.processAttendance(
        this.getBaseProcessingOptions(false, '20:00', {
          isOvertime: true,
          overtimeRequestId: overtimeRequest.id,
          entryType: PeriodType.OVERTIME,
        }),
      );

      // Validate final state
      const finalValidation = await this.validateAttendanceState(
        AttendanceState.OVERTIME,
        CheckStatus.CHECKED_OUT,
      );

      // Validate time entries
      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: this.testEmployee.employeeId,
          date: this.currentDate,
        },
        include: {
          overtimeMetadata: true,
        },
      });

      const hasValidTimeEntries =
        timeEntries.length === 2 &&
        timeEntries.some(
          (e) => e.entryType === PeriodType.REGULAR && e.regularHours === 8,
        ) &&
        timeEntries.some(
          (e) => e.entryType === PeriodType.OVERTIME && e.overtimeHours === 3,
        );

      console.log('Validation Results:', {
        finalState: finalValidation,
        timeEntries: hasValidTimeEntries,
      });

      return finalValidation && hasValidTimeEntries;
    } catch (error) {
      console.error('Overtime attendance test failed:', error);
      return false;
    }
  }

  async testLateCheckIn() {
    console.log('\nTesting Late Check-in Scenario');

    try {
      // Late Check-in
      console.log('Step 1: Late Check-in at 08:06');
      const checkInResult = await this.attendanceService.processAttendance(
        this.getBaseProcessingOptions(true, '08:06'),
      );

      if (!checkInResult.success) {
        throw new Error(`Late check-in failed: ${checkInResult.errors}`);
      }

      // Validate state and late flag
      const status = await this.attendanceService.getLatestAttendanceStatus(
        this.testEmployee.employeeId,
      );

      const isValid =
        status.state === AttendanceState.PRESENT &&
        status.checkStatus === CheckStatus.CHECKED_IN &&
        status.isLateCheckIn === true;

      console.log('Late Check-in validation:', isValid ? 'PASSED' : 'FAILED');

      return isValid;
    } catch (error) {
      console.error('Late check-in test failed:', error);
      return false;
    }
  }
}

async function runComprehensiveTests() {
  const testSuite = new AttendanceTestSuite();
  await testSuite.initialize();

  console.log('Starting comprehensive attendance tests...\n');

  const results = {
    regularAttendance: await testSuite.testRegularAttendance(),
    overtimeAttendance: await testSuite.testOvertimeAttendance(),
    lateCheckIn: await testSuite.testLateCheckIn(),
  };

  console.log('\nTest Results Summary:');
  console.log('---------------------');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${test}: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  });

  await prisma.$disconnect();
}

if (require.main === module) {
  runComprehensiveTests().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}
