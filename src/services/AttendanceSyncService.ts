import { PrismaClient, User, Shift, Holiday } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { AttendanceService } from './AttendanceService';
import { NotificationService } from './NotificationService';
import { ShiftManagementService } from './ShiftManagementService';
import { HolidayService } from './HolidayService';
import { Shift104HolidayService } from './Shift104HolidayService';
import { leaveServiceServer } from './LeaveServiceServer';
import {
  startOfDay,
  endOfDay,
  subMinutes,
  addHours,
  isAfter,
  parseISO,
  format,
  setHours,
  setMinutes,
  addDays,
  subDays,
  isSameDay,
} from 'date-fns';

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
  leaveServiceServer,
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
          1, // Number of days to sync
        );

      for (const record of records) {
        const existingAttendance = await this.findExistingAttendance(
          user.id,
          new Date(record.sj),
        );

        if (!existingAttendance) {
          const convertedRecord =
            attendanceService.convertExternalToAttendanceRecord(record);
          const recordDate = new Date(record.date);
          const holidays = await holidayService.getHolidays(
            recordDate,
            recordDate,
          );
          const processedAttendance =
            await attendanceService.processAttendanceData(
              convertedRecord ? [convertedRecord] : [],
              attendanceService.convertToUserData(user),
              recordDate,
              recordDate,
              holidays,
            );

          if (processedAttendance.processedAttendance.length > 0) {
            const attendance = processedAttendance.processedAttendance[0];
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
    const fifteenMinutesAgo = subMinutes(currentTime, 15);

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
        session.employeeId,
        `เวลาทำงาน OT ใกล้สิ้นสุดลงแล้ว ระบบได้บันทึกชั่วโมงทำ OT เมื่อมีการลงเวลาออกงาน`,
      );
    }
  }

  private async findExistingAttendance(employeeId: string, date: Date) {
    const startOfDayDate = startOfDay(date);
    const endOfDayDate = endOfDay(date);
    return prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDayDate,
          lt: endOfDayDate,
        },
        OR: [{ checkInTime: date }, { checkOutTime: date }],
      },
    });
  }

  private createNotificationMessage(record: any, attendance: any): string {
    const time = format(new Date(record.sj), 'HH:mm');
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
    const today = startOfDay(new Date());
    const users = await prisma.user.findMany({
      where: {
        role: { not: 'ADMIN' },
      },
      include: {
        assignedShift: true,
        leaveRequests: {
          where: {
            startDate: { lte: today },
            endDate: { gte: today },
            status: 'APPROVED',
          },
        },
      },
    });

    const holidays = await holidayService.getHolidays(today, today);

    for (const user of users) {
      const effectiveShift = await shiftManagementService.getEffectiveShift(
        user.id,
        today,
      );

      if (!effectiveShift) continue;

      const isWorkDay = effectiveShift.shift.workDays.includes(today.getDay());
      const isOnLeave = user.leaveRequests.length > 0;
      const isHoliday = this.isHolidayForUser(user, holidays, today);

      if (isWorkDay && !isOnLeave && !isHoliday) {
        const checkIn = await prisma.attendance.findFirst({
          where: {
            employeeId: user.employeeId,
            date: today,
            checkInTime: { not: null },
          },
        });

        if (!checkIn) {
          const [hours, minutes] = effectiveShift.shift.startTime
            .split(':')
            .map(Number);
          const shiftStartTime = setMinutes(setHours(today, hours), minutes);
          const oneHourAfterShiftStart = addHours(shiftStartTime, 1);

          if (isAfter(new Date(), oneHourAfterShiftStart)) {
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
      const shiftedDate = subDays(date, 1); // Change this from addDays to subDays
      return holidays.some((holiday) => isSameDay(holiday.date, shiftedDate));
    }
    return holidays.some((holiday) => isSameDay(holiday.date, date));
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
