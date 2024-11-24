// scripts/test-attendance/basic.ts
import { PrismaClient } from '@prisma/client';
import {
  getCurrentTime,
  formatBangkokTime,
  formatDate,
  formatTime,
  toBangkokTime,
} from '../../src/utils/dateUtils';
import {
  AttendanceState,
  CheckStatus,
  PeriodType,
} from '../../src/types/attendance';

const prisma = new PrismaClient();

async function testBasicCheckIn() {
  try {
    // 1. Setup - Create test employee
    console.log('Creating test employee...');
    const testEmployee = await prisma.user.upsert({
      where: { employeeId: 'TEST001' },
      update: {},
      create: {
        employeeId: 'TEST001',
        name: 'Test Employee',
        departmentName: 'Test Department',
        role: 'Employee',
      },
    });

    // 2. Test data
    const testDate = getCurrentTime(); // Gets current Bangkok time
    const checkInTime = '08:00';
    const checkOutTime = '17:00';

    // Create Date objects for check-in/out times
    const checkInDateTime = toBangkokTime(
      `${formatDate(testDate)}T${checkInTime}`,
    );
    const checkOutDateTime = toBangkokTime(
      `${formatDate(testDate)}T${checkOutTime}`,
    );

    // 3. Create attendance record
    console.log('Creating attendance record...');
    const attendance = await prisma.attendance.create({
      data: {
        employeeId: testEmployee.employeeId,
        date: testDate,
        state: AttendanceState.PRESENT,
        checkStatus: CheckStatus.CHECKED_OUT,
        regularCheckInTime: checkInDateTime,
        regularCheckOutTime: checkOutDateTime,
        shiftStartTime: checkInDateTime,
        shiftEndTime: checkOutDateTime,
        isManualEntry: true,
      },
    });

    // 4. Create time entry
    console.log('Creating time entry...');
    const timeEntry = await prisma.timeEntry.create({
      data: {
        employeeId: testEmployee.employeeId,
        date: testDate,
        startTime: checkInDateTime,
        endTime: checkOutDateTime,
        status: 'completed',
        entryType: PeriodType.REGULAR,
        regularHours: 8,
        overtimeHours: 0,
        attendanceId: attendance.id,
      },
    });

    // 5. Verify
    console.log('Verifying record...');
    const verification = await prisma.attendance.findFirst({
      where: { id: attendance.id },
      include: {
        timeEntries: true,
      },
    });

    // 6. Print results using formatting utils
    console.log('\nTest Results:');
    console.log('--------------');
    console.log('Attendance Record:', {
      employeeId: verification?.employeeId,
      date: formatBangkokTime(verification?.date!, 'yyyy-MM-dd HH:mm:ss'),
      state: verification?.state,
      checkStatus: verification?.checkStatus,
      regularCheckInTime: verification?.regularCheckInTime
        ? formatBangkokTime(
            verification.regularCheckInTime,
            'yyyy-MM-dd HH:mm:ss',
          )
        : null,
      regularCheckOutTime: verification?.regularCheckOutTime
        ? formatBangkokTime(
            verification.regularCheckOutTime,
            'yyyy-MM-dd HH:mm:ss',
          )
        : null,
    });

    console.log('\nTime Entry:', {
      startTime: verification?.timeEntries[0]?.startTime
        ? formatBangkokTime(
            verification.timeEntries[0].startTime,
            'yyyy-MM-dd HH:mm:ss',
          )
        : null,
      endTime: verification?.timeEntries[0]?.endTime
        ? formatBangkokTime(
            verification.timeEntries[0].endTime,
            'yyyy-MM-dd HH:mm:ss',
          )
        : null,
      regularHours: verification?.timeEntries[0]?.regularHours,
    });

    return { success: true, data: verification };
  } catch (error) {
    console.error('Test failed:', error);
    return { success: false, error };
  }
}

// Clean up function remains the same
async function cleanup() {
  console.log('Cleaning up test data...');
  await prisma.timeEntry.deleteMany({
    where: { employeeId: 'TEST001' },
  });
  await prisma.attendance.deleteMany({
    where: { employeeId: 'TEST001' },
  });
  console.log('Cleanup completed');
}

// Main execution
async function main() {
  try {
    // First cleanup any existing test data
    await cleanup();

    // Run the test
    const result = await testBasicCheckIn();

    if (result.success) {
      console.log('\nTest completed successfully!');
    } else {
      console.log('\nTest failed!');
      console.error(result.error);
    }
  } catch (error) {
    console.error('Error in test execution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
