// src/scripts/attendance-test/setup.ts
import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';

const prisma = new PrismaClient();

async function setupTestEnvironment() {
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

  // 3. Create test employee
  const testEmployee = await prisma.user.create({
    data: {
      employeeId: 'TEST001',
      name: 'Test Employee',
      departmentName: testDepartment.name,
      departmentId: testDepartment.id,
      role: 'Employee',
      shiftCode: regularShift.shiftCode,
      shiftId: regularShift.id,
    },
  });

  return {
    department: testDepartment,
    shifts: {
      regular: regularShift,
      night: nightShift,
    },
    employee: testEmployee,
  };
}

export { setupTestEnvironment };
