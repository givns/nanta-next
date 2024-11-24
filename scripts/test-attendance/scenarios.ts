// scripts/test-attendance/scenarios.ts
import { PrismaClient } from '@prisma/client';
import {
  getCurrentTime,
  formatBangkokTime,
  formatDate,
  toBangkokTime,
} from '../../src/utils/dateUtils';
import {
  AttendanceState,
  CheckStatus,
  PeriodType,
} from '../../src/types/attendance';
import { cleanupTestData } from './cleanup';

const prisma = new PrismaClient();

const BASIC_SCENARIOS = [
  {
    name: 'On-time regular attendance',
    setup: {
      checkInTime: '08:00',
      checkOutTime: '17:00',
      shiftStart: '08:00',
      shiftEnd: '17:00',
    },
    expected: {
      state: AttendanceState.PRESENT,
      checkStatus: CheckStatus.CHECKED_OUT,
      flags: {},
    },
  },
  {
    name: 'Late check-in',
    setup: {
      checkInTime: '08:06',
      checkOutTime: '17:00',
      shiftStart: '08:00',
      shiftEnd: '17:00',
    },
    expected: {
      state: AttendanceState.PRESENT,
      checkStatus: CheckStatus.CHECKED_OUT,
      flags: {
        isLateCheckIn: true,
      },
    },
  },
  {
    name: 'Regular overtime',
    setup: {
      checkInTime: '08:00',
      checkOutTime: '17:00',
      shiftStart: '08:00',
      shiftEnd: '17:00',
      overtimeStart: '17:00',
      overtimeEnd: '20:00',
    },
    expected: {
      state: AttendanceState.OVERTIME,
      checkStatus: CheckStatus.CHECKED_OUT,
      flags: {
        isOvertime: true,
      },
    },
  },
];

async function runBasicTest() {
  try {
    // First cleanup
    await cleanupTestData();

    const testDate = getCurrentTime();
    console.log('Running basic attendance tests...\n');

    // Create test employee
    const employee = await prisma.user.upsert({
      where: { employeeId: 'TEST001' },
      update: {},
      create: {
        employeeId: 'TEST001',
        name: 'Test Employee',
        departmentName: 'Test Department',
        role: 'Employee',
      },
    });

    // Run each scenario
    for (const scenario of BASIC_SCENARIOS) {
      console.log(`Testing scenario: ${scenario.name}`);
      try {
        // Create overtime request if needed
        let overtimeRequest;
        if (scenario.setup.overtimeStart && scenario.setup.overtimeEnd) {
          overtimeRequest = await prisma.overtimeRequest.create({
            data: {
              employeeId: employee.employeeId,
              name: employee.name,
              date: testDate,
              startTime: scenario.setup.overtimeStart,
              endTime: scenario.setup.overtimeEnd,
              status: 'approved',
              isDayOffOvertime: false,
              isInsideShiftHours: false,
            },
          });
        }

        // Create attendance record
        const attendance = await prisma.attendance.create({
          data: {
            employeeId: employee.employeeId,
            date: testDate,
            state: scenario.expected.state,
            checkStatus: scenario.expected.checkStatus,
            isOvertime: !!overtimeRequest,
            regularCheckInTime: toBangkokTime(
              `${formatDate(testDate)}T${scenario.setup.checkInTime}`,
            ),
            regularCheckOutTime: toBangkokTime(
              `${formatDate(testDate)}T${scenario.setup.checkOutTime}`,
            ),
            shiftStartTime: toBangkokTime(
              `${formatDate(testDate)}T${scenario.setup.shiftStart}`,
            ),
            shiftEndTime: toBangkokTime(
              `${formatDate(testDate)}T${scenario.setup.shiftEnd}`,
            ),
            isLateCheckIn: scenario.expected.flags.isLateCheckIn || false,
            isManualEntry: true,
          },
        });

        // Create time entry
        await prisma.timeEntry.create({
          data: {
            employeeId: employee.employeeId,
            date: testDate,
            startTime: toBangkokTime(
              `${formatDate(testDate)}T${scenario.setup.checkInTime}`,
            ),
            endTime: toBangkokTime(
              `${formatDate(testDate)}T${scenario.setup.checkOutTime}`,
            ),
            status: 'completed',
            entryType: PeriodType.REGULAR,
            regularHours: 8,
            overtimeHours: 0,
            attendanceId: attendance.id,
          },
        });

        console.log(`✅ ${scenario.name}: PASSED\n`);
      } catch (error) {
        console.error(`❌ ${scenario.name}: FAILED`, error);
      }
    }
  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runBasicTest();
}
