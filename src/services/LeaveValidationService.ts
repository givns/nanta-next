// services/LeaveValidationService.ts
import { PrismaClient } from '@prisma/client';
import { differenceInMonths } from 'date-fns';

export class LeaveValidationService {
  constructor(private prisma: PrismaClient) {}

  private async getSettings() {
    const settings = await this.prisma.leaveSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    return settings;
  }

  async validateLeaveRequest(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    leaveType: string,
  ) {
    const settings = await this.getSettings();
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      include: {
        department: true,
      },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    if (!employee.workStartDate) {
      throw new Error('Employee work start date not set');
    }

    // Check service period for annual leave
    if (leaveType === 'annual') {
      const serviceMonths = differenceInMonths(
        new Date(),
        employee.workStartDate,
      );
      if (settings && serviceMonths < settings.minServiceForAnnualLeave) {
        throw new Error(
          `Minimum service period of ${settings.minServiceForAnnualLeave} months required for annual leave`,
        );
      }
    }

    // Check advance booking
    if (!settings) {
      throw new Error('Leave settings not found');
    }

    const advanceNotice = differenceInMonths(startDate, new Date());
    if (advanceNotice < settings.minAdvanceNotice) {
      throw new Error(
        `Minimum advance notice is ${settings.minAdvanceNotice} days`,
      );
    }

    if (advanceNotice > settings.maxAdvanceBookingDays) {
      throw new Error(
        `Cannot book leave more than ${settings.maxAdvanceBookingDays} days in advance`,
      );
    }

    // Add more validations based on settings...

    return true;
  }

  async calculateInitialLeaveBalance(workStartDate: Date) {
    const settings = await this.getSettings();
    const serviceMonths = differenceInMonths(new Date(), workStartDate);

    // Calculate prorated annual leave if eligible
    const annualLeave =
      settings && serviceMonths >= settings.minServiceForAnnualLeave
        ? Math.floor((settings.annualLeaveDefault * serviceMonths) / 12)
        : 0;

    return {
      sickLeave: settings ? settings.sickLeaveDefault : 0,
      businessLeave: settings ? settings.businessLeaveDefault : 0,
      annualLeave,
    };
  }
}
