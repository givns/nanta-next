import { PrismaClient } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { AttendanceService } from './AttendanceService';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const attendanceService = new AttendanceService();

export class ReconciliationService {
  async reconcileAttendanceData(userId: string, date: Date) {
    const internalAttendance = await prisma.attendance.findMany({
      where: { userId, date },
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });
    if (!user || !user.assignedShift)
      throw new Error('User or assigned shift not found');

    const { records } = await externalDbService.getDailyAttendanceRecords(
      user.employeeId,
    );

    for (const record of records) {
      const matchingInternalRecord = internalAttendance.find(
        (ia) => ia.checkInTime?.toISOString() === record.sj,
      );

      if (!matchingInternalRecord) {
        await attendanceService.processExternalCheckInOut(
          record,
          user,
          user.assignedShift,
        );
      }
    }
  }
}
