// src/scripts/test-attendance/basic.ts
import { PrismaClient } from '@prisma/client';
import { format, parseISO } from 'date-fns';
import {
  AttendanceState,
  CheckStatus,
  PeriodType,
} from '../../../src/types/attendance';

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
    const testDate = new Date();
    const checkInTime = '08:00';
    const checkOutTime = '17:00';

    // 3. Create attendance record
    console.log('Creating attendance record...');
    const attendance = await prisma.attendance.create({
      data: {
        employeeId: testEmployee.employeeId,
        date: testDate,
        state: AttendanceState.PRESENT,
        checkStatus: CheckStatus.CHECKED_OUT,
        regularCheckInTime: parseISO(
          `${format(testDate, 'yyyy-MM-dd')}T${checkInTime}`,
        ),
        regularCheckOutTime: parseISO(
          `${format(testDate, 'yyyy-MM-dd')}T${checkOutTime}`,
        ),
        shiftStartTime: parseISO(
          `${format(testDate, 'yyyy-MM-dd')}T${checkInTime}`,
        ),
        shiftEndTime: parseISO(
          `${format(testDate, 'yyyy-MM-dd')}T${checkOutTime}`,
        ),
        isManualEntry: true,
      },
    });

    // 4. Create time entry
    console.log('Creating time entry...');
    const timeEntry = await prisma.timeEntry.create({
      data: {
        employeeId: testEmployee.employeeId,
        date: testDate,
        startTime: parseISO(`${format(testDate, 'yyyy-MM-dd')}T${checkInTime}`),
        endTime: parseISO(`${format(testDate, 'yyyy-MM-dd')}T${checkOutTime}`),
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

    // 6. Print results
    console.log('\nTest Results:');
    console.log('--------------');
    console.log('Attendance Record:', {
      employeeId: verification?.employeeId,
      date: verification?.date,
      state: verification?.state,
      checkStatus: verification?.checkStatus,
      regularCheckInTime: verification?.regularCheckInTime,
      regularCheckOutTime: verification?.regularCheckOutTime,
    });

    console.log('\nTime Entry:', {
      startTime: verification?.timeEntries[0]?.startTime,
      endTime: verification?.timeEntries[0]?.endTime,
      regularHours: verification?.timeEntries[0]?.regularHours,
    });

    return { success: true, data: verification };
  } catch (error) {
    console.error('Test failed:', error);
    return { success: false, error };
  }
}

// Clean up function
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
