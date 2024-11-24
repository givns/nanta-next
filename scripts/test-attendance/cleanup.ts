// scripts/test-attendance/cleanup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function cleanupTestData() {
  console.log('Starting cleanup...');
  try {
    // Delete in correct order to handle foreign key constraints
    await prisma.$transaction(async (tx) => {
      // 1. Delete time-entry related data first
      await tx.timeEntryPayrollPeriod.deleteMany({
        where: {
          timeEntry: {
            employeeId: 'TEST001',
          },
        },
      });

      await tx.overtimeMetadata.deleteMany({
        where: {
          timeEntry: {
            employeeId: 'TEST001',
          },
        },
      });

      await tx.timeEntry.deleteMany({
        where: { employeeId: 'TEST001' },
      });

      // 2. Delete attendance related data
      await tx.overtimeEntry.deleteMany({
        where: {
          attendance: {
            employeeId: 'TEST001',
          },
        },
      });

      await tx.attendanceLogs.deleteMany({
        where: { employeeId: 'TEST001' },
      });

      await tx.attendance.deleteMany({
        where: { employeeId: 'TEST001' },
      });

      // 3. Delete related requests
      await tx.overtimeRequest.deleteMany({
        where: { employeeId: 'TEST001' },
      });

      await tx.leaveRequest.deleteMany({
        where: { employeeId: 'TEST001' },
      });
    });

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
}

// Allow running cleanup directly
if (require.main === module) {
  cleanupTestData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
