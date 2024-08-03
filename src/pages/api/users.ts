import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { UserData, ShiftData, AttendanceRecord } from '../../types/user';
import { HolidayService } from '../../services/HolidayService';
import { UserRole } from '@/types/enum';
import moment from 'moment-timezone';

const holidayService = new HolidayService();

interface ProcessedAttendance {
  date: Date;
  status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off';
  checkIn?: string;
  checkOut?: string;
  isEarlyCheckIn?: boolean;
  isLateCheckIn?: boolean;
  isLateCheckOut?: boolean;
  overtimeHours?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const today = moment().tz('Asia/Bangkok');
    const startDate =
      moment(today).date() >= 26
        ? moment(today).date(26).startOf('day')
        : moment(today).subtract(1, 'month').date(26).startOf('day');
    const endDate = moment(startDate)
      .add(1, 'month')
      .subtract(1, 'day')
      .endOf('day');

    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        assignedShift: true,
        department: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [payrollAttendance, holidaysData] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          userId: user.id,
          date: {
            gte: startDate.toDate(),
            lte: endDate.toDate(),
          },
        },
        orderBy: { date: 'asc' },
      }),
      holidayService.getHolidays(startDate.toDate(), endDate.toDate()),
    ]);
    // Extract just the dates from the holiday data
    const holidays = holidaysData.map((holiday) => holiday.date);
    const totalDaysInPeriod = endDate.diff(startDate, 'days') + 1;
    const totalWorkingDays = calculateTotalWorkingDays(
      totalDaysInPeriod,
      user.assignedShift.workDays,
      holidays.length,
    );

    // Convert prisma attendance to AttendanceRecord type
    const attendanceRecords: AttendanceRecord[] = payrollAttendance.map(
      (record) => ({
        ...record,
        checkInLocation: record.checkInLocation
          ? JSON.parse(record.checkInLocation as string)
          : null,
        checkOutLocation: record.checkOutLocation
          ? JSON.parse(record.checkOutLocation as string)
          : null,
        isDayOff: false, // Add the missing property 'isDayOff' with a default value
      }),
    );

    const processedAttendance = processAttendanceData(
      attendanceRecords,
      user.assignedShift,
      holidays,
    );

    const totalPresent = processedAttendance.filter(
      (a) => a.status === 'present',
    ).length;
    const totalAbsent = totalWorkingDays - totalPresent;
    const overtimeHours = processedAttendance.reduce(
      (sum, a) => sum + (a.overtimeHours || 0),
      0,
    );
    const balanceLeave = await calculateLeaveBalance(user.id);

    const userData: UserData & { assignedShift: ShiftData } = {
      id: user.id,
      lineUserId: user.lineUserId,
      name: user.name,
      nickname: user.nickname || '',
      departmentId: user.departmentId,
      department: user.department.name,
      employeeId: user.employeeId,
      role: user.role as UserRole,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift as ShiftData,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal
        ? `https://profile-pictures/${user.profilePictureExternal}.jpg`
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      overtimeHours: user.overtimeHours || 0,
      sickLeaveBalance: user.sickLeaveBalance || 0,
      businessLeaveBalance: user.businessLeaveBalance || 0,
      annualLeaveBalance: user.annualLeaveBalance || 0,
      overtimeLeaveBalance: user.overtimeLeaveBalance || 0,
    };

    const responseData = {
      user: userData,
      payrollAttendance: processedAttendance,
      totalWorkingDays,
      totalPresent,
      totalAbsent,
      overtimeHours,
      balanceLeave,
      payrollPeriod: {
        start: startDate.format('YYYY-MM-DD'),
        end: endDate.format('YYYY-MM-DD'),
      },
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function calculateTotalWorkingDays(
  totalDays: number,
  workDays: number[],
  holidays: number,
): number {
  const workingDaysPerWeek = workDays.length;
  const weeks = Math.floor(totalDays / 7);
  const remainingDays = totalDays % 7;

  let totalWorkingDays = weeks * workingDaysPerWeek;

  for (let i = 0; i < remainingDays; i++) {
    if (workDays.includes((i + 1) % 7)) {
      totalWorkingDays++;
    }
  }

  return totalWorkingDays - holidays;
}

async function calculateLeaveBalance(id: string): Promise<number> {
  // Implement leave balance calculation logic here
  // This could involve fetching the user's leave requests and calculating the remaining balance
  // For now, we'll return a placeholder value
  return 10;
}
function processAttendanceData(
  attendanceRecords: AttendanceRecord[],
  shift: ShiftData,
  holidays: Date[],
): ProcessedAttendance[] {
  const processedAttendance: ProcessedAttendance[] = [];
  let currentDate = moment(attendanceRecords[0]?.date).startOf('day');
  const endDate = moment(
    attendanceRecords[attendanceRecords.length - 1]?.date,
  ).endOf('day');

  while (currentDate.isSameOrBefore(endDate)) {
    const dayRecords = attendanceRecords.filter((record) =>
      moment(record.date).isSame(currentDate, 'day'),
    );

    const isHoliday = holidays.some((holiday) =>
      moment(holiday).isSame(currentDate, 'day'),
    );
    const isWorkDay = shift.workDays.includes(currentDate.day());

    if (isWorkDay && !isHoliday) {
      if (dayRecords.length === 0) {
        processedAttendance.push({
          date: currentDate.toDate(),
          status: 'absent',
        });
      } else {
        const processed = processShiftAttendance(
          dayRecords,
          shift,
          currentDate,
        );
        processedAttendance.push(processed);
      }
    } else {
      processedAttendance.push({
        date: currentDate.toDate(),
        status: isHoliday ? 'holiday' : 'off',
      });
    }

    currentDate.add(1, 'day');
  }

  return processedAttendance;
}

function processShiftAttendance(
  records: AttendanceRecord[],
  shift: ShiftData,
  date: moment.Moment,
): ProcessedAttendance {
  const shiftStart = moment(date).set({
    hour: parseInt(shift.startTime.split(':')[0]),
    minute: parseInt(shift.startTime.split(':')[1]),
  });
  let shiftEnd = moment(date).set({
    hour: parseInt(shift.endTime.split(':')[0]),
    minute: parseInt(shift.endTime.split(':')[1]),
  });

  if (shiftEnd.isBefore(shiftStart)) {
    shiftEnd.add(1, 'day');
  }

  const checkIn = records.find((r) => r.checkInTime)?.checkInTime;
  const checkOut = records.find((r) => r.checkOutTime)?.checkOutTime;

  if (!checkIn || !checkOut) {
    return {
      date: date.toDate(),
      status: 'incomplete',
      checkIn: checkIn ? moment(checkIn).format('HH:mm:ss') : undefined,
      checkOut: checkOut ? moment(checkOut).format('HH:mm:ss') : undefined,
    };
  }

  const checkInTime = moment(checkIn);
  const checkOutTime = moment(checkOut);

  if (checkOutTime.isBefore(checkInTime)) {
    checkOutTime.add(1, 'day');
  }

  const isEarlyCheckIn = checkInTime.isBefore(shiftStart);
  const isLateCheckIn = checkInTime.isAfter(shiftStart.add(15, 'minutes'));
  const isLateCheckOut = checkOutTime.isAfter(shiftEnd);

  let overtimeMinutes = 0;
  if (isEarlyCheckIn) {
    overtimeMinutes += shiftStart.diff(checkInTime, 'minutes');
  }
  if (isLateCheckOut) {
    overtimeMinutes += checkOutTime.diff(shiftEnd, 'minutes');
  }

  // Round overtime to nearest 30 minutes
  const overtimeHours = Math.round(overtimeMinutes / 30) * 0.5;

  return {
    date: date.toDate(),
    status: 'present',
    checkIn: checkInTime.format('HH:mm:ss'),
    checkOut: checkOutTime.format('HH:mm:ss'),
    isEarlyCheckIn,
    isLateCheckIn,
    isLateCheckOut,
    overtimeHours: overtimeHours > 0 ? overtimeHours : undefined,
  };
}

interface ProcessedAttendance {
  date: Date;
  status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off';
  checkIn?: string;
  checkOut?: string;
  isEarlyCheckIn?: boolean;
  isLateCheckIn?: boolean;
  isLateCheckOut?: boolean;
  overtimeHours?: number;
}
