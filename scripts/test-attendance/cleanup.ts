import { PrismaClient, Prisma } from '@prisma/client';

export async function cleanupTestData() {
  const prisma = new PrismaClient();

  console.log('Starting cleanup...');

  try {
    await prisma.$transaction(async (tx) => {
      // Delete attendance-related records
      await tx.attendanceLogs.deleteMany({});
      await tx.timeEntry.deleteMany({});
      await tx.overtimeEntry.deleteMany({});
      await tx.attendance.deleteMany({});

      // Delete request-related records
      await tx.leaveRequest.deleteMany({});
      await tx.overtimeRequest.deleteMany({});
      await tx.shiftAdjustmentRequest.deleteMany({});

      // Delete test data
      await tx.user.deleteMany({
        where: {
          employeeId: 'TEST001',
        },
      });

      await tx.shift.deleteMany({
        where: {
          OR: [{ shiftCode: 'TEST-REG' }, { shiftCode: 'TEST-NIGHT' }],
        },
      });

      await tx.department.deleteMany({
        where: {
          name: 'Test Department',
        },
      });
    });

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export async function cleanupSpecificTestData(
  prisma: PrismaClient,
  employeeId: string,
) {
  try {
    await prisma.$transaction(async (tx) => {
      // Delete specific employee's records
      await tx.attendanceLogs.deleteMany({
        where: {
          attendance: {
            employeeId: employeeId,
          },
        },
      });

      await tx.timeEntry.deleteMany({
        where: {
          user: {
            employeeId: employeeId,
          },
        },
      });

      await tx.overtimeEntry.deleteMany({
        where: {
          attendance: {
            employeeId: employeeId,
          },
        },
      });

      await tx.attendance.deleteMany({
        where: {
          employeeId: employeeId,
        },
      });

      await tx.leaveRequest.deleteMany({
        where: {
          employeeId: employeeId,
        },
      });

      await tx.overtimeRequest.deleteMany({
        where: {
          employeeId: employeeId,
        },
      });

      await tx.shiftAdjustmentRequest.deleteMany({
        where: {
          employeeId: employeeId,
        },
      });

      await tx.user
        .delete({
          where: {
            employeeId: employeeId,
          },
        })
        .catch((e) => {
          // Ignore if user doesn't exist
          if (e.code !== 'P2025') throw e;
        });
    });

    console.log(`Cleanup completed successfully for employee ${employeeId}`);
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        // Record not found - this is fine for cleanup
        console.log(`No records found for employee ${employeeId}`);
        return;
      }
    }
    throw error;
  }
}
