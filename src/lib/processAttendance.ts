import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../services/AttendanceService';
import { ExternalDbService } from '../services/ExternalDbService';
import { HolidayService } from '../services/HolidayService';
import { Shift104HolidayService } from '../services/Shift104HolidayService';
import { UserData, ProcessedAttendance, AttendanceRecord } from '../types/user';
import { logMessage } from '../utils/inMemoryLogger';
import { leaveServiceServer } from '../services/LeaveServiceServer';
import { addMinutes, subMinutes, format, parseISO } from 'date-fns';

const prisma = new PrismaClient();
const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();

const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
  leaveServiceServer,
);

export async function processAttendance(job: Job): Promise<any> {
  const { employeeId, startDate, endDate } = job.data;
  logMessage(
    `Starting attendance processing for employee: ${employeeId} from ${startDate} to ${endDate}`,
  );

  try {
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: {
        assignedShift: true,
        department: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    logMessage(`User found: ${user.name}`);

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      role: user.role as any,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift,
      overtimeHours: user.overtimeHours,
      potentialOvertimes: [], // This should be populated if needed
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    logMessage(`UserData prepared: ${JSON.stringify(userData)}`);

    // Calculate payroll period using date-fns
    const today = new Date();
    const payrollStartDate =
      today.getDate() >= 26
        ? subMinutes(
            parseISO(
              `${today.getFullYear()}-${today.getMonth() + 1}-26T00:00:00Z`,
            ),
            0,
          )
        : subMinutes(
            parseISO(`${today.getFullYear()}-${today.getMonth()}-26T00:00:00Z`),
            0,
          );
    const payrollEndDate = addMinutes(today, 0); // Use current date instead of full period end

    logMessage(
      `Payroll period: ${format(payrollStartDate, 'yyyy-MM-dd')} to ${format(payrollEndDate, 'yyyy-MM-dd')}`,
    );

    // Fetch attendance records
    logMessage(`Fetching attendance records from external database...`);
    const { records: externalAttendances, totalCount } =
      await externalDbService.getHistoricalAttendanceRecords(
        user.employeeId,
        payrollStartDate,
        payrollEndDate,
      );

    logMessage(
      `Found ${externalAttendances.length} attendance records out of ${totalCount} total records`,
    );

    const attendanceRecords: AttendanceRecord[] = externalAttendances
      .map((externalRecord) =>
        attendanceService.convertExternalToAttendanceRecord(externalRecord),
      )
      .filter((record): record is AttendanceRecord => record !== undefined);

    // Process attendance data (including potential overtime calculation and flagging)
    const processedAttendance = await attendanceService.processAttendanceData(
      attendanceRecords,
      userData,
      payrollStartDate,
      payrollEndDate,
    );

    logMessage(`Processed ${processedAttendance.length} attendance records`);

    // Calculate summary statistics
    const totalWorkingDays = processedAttendance.length;
    const totalPresent = processedAttendance.filter(
      (a) => a.status === 'present' || a.status === 'incomplete',
    ).length;
    const totalAbsent = totalWorkingDays - totalPresent;
    const totalOvertimeHours = processedAttendance.reduce(
      (sum, a) => sum + (a.overtimeHours || 0),
      0,
    );
    const totalRegularHours = processedAttendance.reduce(
      (sum, a) => sum + (a.regularHours || 0),
      0,
    );

    logMessage(`Summary statistics calculated:
      Total Working Days: ${totalWorkingDays}
      Total Present: ${totalPresent}
      Total Absent: ${totalAbsent}
      Total Overtime Hours: ${totalOvertimeHours}
      Total Regular Hours: ${totalRegularHours}`);

    // Store processed data
    const payrollProcessingResult = await prisma.payrollProcessingResult.create(
      {
        data: {
          employeeId: user.employeeId,
          periodStart: payrollStartDate,
          periodEnd: payrollEndDate,
          totalWorkingDays,
          totalPresent,
          totalAbsent,
          totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
          totalRegularHours: Math.round(totalRegularHours * 100) / 100,
          processedData: JSON.stringify(processedAttendance),
        },
      },
    );

    logMessage(
      `Payroll processing result stored with ID: ${payrollProcessingResult.id}`,
    );

    // Update user's overtime hours
    await prisma.user.update({
      where: { id: user.id },
      data: { overtimeHours: Math.round(totalOvertimeHours * 100) / 100 },
    });

    logMessage(`User's overtime hours updated to: ${totalOvertimeHours}`);

    return {
      success: true,
      message: 'Payroll processed successfully',
      payrollProcessingResultId: payrollProcessingResult.id,
      summary: {
        totalWorkingDays,
        totalPresent,
        totalAbsent,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        totalRegularHours: Math.round(totalRegularHours * 100) / 100,
      },
    };
  } catch (error: any) {
    logMessage(`Error processing payroll: ${error.message}`);
    console.error('Error processing payroll:', error);
    throw error;
  }
}
