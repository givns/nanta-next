import { PrismaClient } from '@prisma/client';
import { initializeServices } from '../../src/services/ServiceInitializer';
import { AttendanceService } from '../../src/services/Attendance/AttendanceService';
import { cleanupSpecificTestData, cleanupTestData } from './cleanup';

async function setupTestEnvironment() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('This setup should only run in test environment');
  }
  const prisma = new PrismaClient();

  try {
    // Clean up existing test data
    await cleanupTestData();

    // 1. Create test department
    const testDepartment = await prisma.department.create({
      data: {
        name: 'Test Department',
      },
    });

    // 2. Create test shifts
    const regularShift = await prisma.shift.create({
      data: {
        shiftCode: 'TEST-REG',
        name: 'Regular Test Shift',
        startTime: '08:00',
        endTime: '17:00',
        workDays: [1, 2, 3, 4, 5], // Mon-Fri
      },
    });

    const nightShift = await prisma.shift.create({
      data: {
        shiftCode: 'TEST-NIGHT',
        name: 'Night Test Shift',
        startTime: '21:00',
        endTime: '06:00',
        workDays: [1, 2, 3, 4, 5],
      },
    });

    // Create test employee with upsert to handle potential duplicates
    const testEmployee = await prisma.user.upsert({
      where: { employeeId: 'TEST001' },
      update: {
        name: 'Test Employee',
        departmentName: testDepartment.name,
        departmentId: testDepartment.id,
        role: 'Employee',
        shiftCode: regularShift.shiftCode,
        shiftId: regularShift.id,
      },
      create: {
        employeeId: 'TEST001',
        name: 'Test Employee',
        departmentName: testDepartment.name,
        departmentId: testDepartment.id,
        role: 'Employee',
        shiftCode: regularShift.shiftCode,
        shiftId: regularShift.id,
      },
    });

    // Initialize services
    const services = initializeServices(prisma);

    return {
      department: testDepartment,
      shifts: {
        regular: regularShift,
        night: nightShift,
      },
      employee: testEmployee,
      services,
      attendanceService: new AttendanceService(
        prisma,
        services.shiftService,
        services.holidayService,
        services.leaveService,
        services.overtimeService,
        services.notificationService,
        services.timeEntryService,
      ),
    };
  } catch (error) {
    console.error('Setup failed:', error);
    // Clean up any partial test data if setup fails
    try {
      await cleanupSpecificTestData(prisma, 'TEST001');
    } catch (cleanupError) {
      console.error('Cleanup after setup failure also failed:', cleanupError);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export { setupTestEnvironment };
