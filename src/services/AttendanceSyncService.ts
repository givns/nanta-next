// services/AttendanceSyncService.ts

import { PrismaClient, User, Shift, Holiday } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { AttendanceService } from './AttendanceService';
import { NotificationService } from './NotificationService';
import { ShiftManagementService } from './ShiftManagementService';
import { HolidayService } from './HolidayService';
import { Shift104HolidayService } from './Shift104HolidayService';
import moment from 'moment-timezone';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const notificationService = new NotificationService();
const shiftManagementService = new ShiftManagementService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();
const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
);

export class AttendanceSyncService {
  async syncAttendanceData(syncType: string = 'regular') {
    console.log(`Starting ${syncType} attendance sync`);
    const users = await prisma.user.findMany({
      where: { employeeId: { not: '' } },
      include: { assignedShift: true },
    });

    for (const user of users) {
      await this.syncUserAttendance(user, syncType);
    }
    console.log(`${syncType} attendance sync completed`);
  }

  async syncUserAttendance(
    user: User & { assignedShift: Shift },
    syncType: string,
  ) {
    try {
      const { records, userInfo } =
        await externalDbService.getDailyAttendanceRecords(
          user.employeeId,
          1, // Replace startDate with the number of days
        );

      for (const record of records) {
        const existingAttendance = await this.findExistingAttendance(
          user.id,
          new Date(record.sj),
        );

        if (!existingAttendance) {
          const attendance = await attendanceService.processExternalCheckInOut(
            record,
            userInfo,
            user.assignedShift,
          );

          const message = this.createNotificationMessage(record, attendance);
          if (user.lineUserId) {
            await notificationService.sendNotification(
              user.id,
              message,
              user.lineUserId,
            );
          } else {
            console.error(
              `User ${user.id} does not have a LINE user ID for notifications`,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `Error syncing attendance for user ${user.employeeId}:`,
        error,
      );
    }
  }

  async checkUnclosedOvertimeSessions(): Promise<void> {
    const currentTime = new Date();
    const fifteenMinutesAgo = new Date(currentTime.getTime() - 15 * 60000);

    const unclosedSessions = await prisma.overtimeRequest.findMany({
      where: {
        status: 'APPROVED',
        endTime: {
          gte: fifteenMinutesAgo.toISOString(),
          lte: currentTime.toISOString(),
        },
        user: {
          attendances: {
            none: {
              checkOutTime: { not: null },
              date: {
                gte: fifteenMinutesAgo,
                lte: currentTime,
              },
            },
          },
        },
      },
      include: { user: true },
    });

    for (const session of unclosedSessions) {
      await notificationService.sendNotification(
        session.userId,
        `เวลาทำงาน OT ใกล้สิ้นสุดลงแล้ว ระบบได้บันทึกชั่วโมงทำ OT เมื่อมีการลงเวลาออกงาน`,
      );
    }
  }

  private async findExistingAttendance(userId: string, date: Date) {
    return prisma.attendance.findFirst({
      where: {
        userId,
        date: {
          gte: moment(date).startOf('day').toDate(),
          lt: moment(date).endOf('day').toDate(),
        },
        OR: [{ checkInTime: date }, { checkOutTime: date }],
      },
    });
  }

  private createNotificationMessage(record: any, attendance: any): string {
    const time = new Date(record.sj).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    let action: string;

    switch (record.fx) {
      case 0:
        action = '';
        break;
      case 1:
        action = 'เข้างาน';
        break;
      case 2:
        action = 'ออกงาน';
        break;
      case 3:
        action = 'เริ่มทำงานล่วงเวลา';
        break;
      case 4:
        action = 'สิ้นสุดทำงานล่วงเวลา';
        break;
      default:
        action = 'บันทึกเวลา';
    }

    return `${action}เรียบร้อยแล้ว: ${time}`;
  }

  async checkMissingCheckIns(): Promise<void> {
    const today = moment().tz('Asia/Bangkok').startOf('day');
    const users = await prisma.user.findMany({
      where: {
        role: { not: 'ADMIN' },
      },
      include: {
        assignedShift: true,
        leaveRequests: {
          where: {
            startDate: { lte: today.toDate() },
            endDate: { gte: today.toDate() },
            status: 'APPROVED',
          },
        },
      },
    });

    const holidays = await holidayService.getHolidays(
      today.toDate(),
      today.toDate(),
    );

    for (const user of users) {
      const effectiveShift = await shiftManagementService.getEffectiveShift(
        user.id,
        today.toDate(),
      );

      if (!effectiveShift) continue;

      const isWorkDay = effectiveShift.shift.workDays.includes(today.day());
      const isOnLeave = user.leaveRequests.length > 0;
      const isHoliday = this.isHolidayForUser(user, holidays, today.toDate());

      if (isWorkDay && !isOnLeave && !isHoliday) {
        const checkIn = await prisma.attendance.findFirst({
          where: {
            userId: user.id,
            date: today.toDate(),
            checkInTime: { not: null },
          },
        });

        if (!checkIn) {
          const shiftStartTime = moment(today).set({
            hour: parseInt(effectiveShift.shift.startTime.split(':')[0]),
            minute: parseInt(effectiveShift.shift.startTime.split(':')[1]),
          });

          if (moment().isAfter(shiftStartTime.add(1, 'hour'))) {
            await this.sendMissingCheckInNotification(
              user,
              effectiveShift.shift,
            );
          }
        }
      }
    }
  }

  private isHolidayForUser(
    user: User & { assignedShift: Shift },
    holidays: Holiday[],
    date: Date,
  ): boolean {
    if (user.assignedShift.shiftCode === 'SHIFT104') {
      const shiftedDate = new Date(date);
      shiftedDate.setDate(shiftedDate.getDate() + 1);
      return holidays.some(
        (holiday) => holiday.date.getTime() === shiftedDate.getTime(),
      );
    }
    return holidays.some(
      (holiday) => holiday.date.getTime() === date.getTime(),
    );
  }

  private async sendMissingCheckInNotification(
    user: User,
    shift: Shift,
  ): Promise<void> {
    const message = `No check-in record found for ${user.name} (${user.employeeId}). Shift start time: ${shift.startTime}`;

    // Send to user
    if (user.lineUserId) {
      await notificationService.sendNotification(user.lineUserId, message);
    }

    // Send to admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    for (const admin of admins) {
      if (admin.lineUserId) {
        await notificationService.sendNotification(admin.lineUserId, message);
      }
    }
  }
}
