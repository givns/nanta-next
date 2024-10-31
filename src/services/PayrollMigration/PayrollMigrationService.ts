// services/PayrollMigration/PayrollMigrationService.ts
import { PayrollCalculationResult, AdminPayrollData } from '@/types/payroll';

export class PayrollMigrationService {
  /**
   * Converts old payroll format to new PayrollCalculationResult
   */
  static convertLegacyFormat(legacyData: any): PayrollCalculationResult {
    return {
      employee: {
        id: legacyData.employee?.id || '',
        employeeId: legacyData.employee?.employeeId || '',
        name: legacyData.employee?.name || '',
        departmentName: legacyData.employee?.departmentName || '',
        role: legacyData.employee?.role || '',
        employeeType: legacyData.employee?.employeeType || 'Fulltime',
      },
      summary: {
        totalWorkingDays: legacyData.totalWorkDays || 0,
        totalPresent: legacyData.daysPresent || 0,
        totalAbsent: legacyData.daysAbsent || 0,
      },
      hours: {
        regularHours: legacyData.regularHours || 0,
        workdayOvertimeHours: legacyData.overtimeHours || 0,
        weekendShiftOvertimeHours: 0,
        holidayOvertimeHours: legacyData.holidayOvertimeHours || 0,
      },
      attendance: {
        totalLateMinutes: legacyData.attendance?.totalLateMinutes || 0,
        earlyDepartures: legacyData.attendance?.earlyDepartures || 0,
      },
      leaves: {
        sick: legacyData.leaves?.sick || 0,
        annual: legacyData.leaves?.annual || 0,
        business: legacyData.leaves?.business || 0,
        holidays: legacyData.leaves?.holidays || 0,
        unpaid: legacyData.leaves?.unpaid || 0,
      },
      rates: {
        regularHourlyRate: legacyData.rates?.regularHourlyRate || 0,
        overtimeRate: legacyData.rates?.overtimeRate || 1.5,
      },
      processedData: {
        basePay: legacyData.earnings?.basePay || 0,
        overtimePay: legacyData.earnings?.overtimePay || 0,
        allowances: {
          transportation: legacyData.allowances?.transportation || 0,
          meal: legacyData.allowances?.meal || 0,
          housing: legacyData.allowances?.housing || 0,
        },
        deductions: {
          socialSecurity: legacyData.deductions?.socialSecurity || 0,
          tax: legacyData.deductions?.tax || 0,
          unpaidLeave: 0,
          total: legacyData.deductions?.total || 0,
        },
        netPayable: legacyData.netPayable || 0,
      },
    };
  }

  /**
   * Validates if the data structure matches the new format
   */
  static validateNewFormat(data: unknown): data is PayrollCalculationResult {
    const result = data as PayrollCalculationResult;
    return (
      result &&
      typeof result.employee === 'object' &&
      typeof result.summary === 'object' &&
      typeof result.hours === 'object' &&
      typeof result.processedData === 'object'
    );
  }
}
