// __tests__/utils/payrollUtils.test.ts
import { PayrollUtils } from '@/utils/payrollUtils';
import { EmployeeType } from '@prisma/client';
import { PayrollSettings, PayrollCalculationResult } from '@/types/payroll';
import { describe, it } from 'node:test';

describe('PayrollUtils', () => {
  const mockSettings: PayrollSettings = {
    overtimeRates: {
      [EmployeeType.Fulltime]: {
        workdayOutsideShift: 1.5,
        weekendInsideShiftFulltime: 1.0,
        weekendInsideShiftParttime: 2.0,
        weekendOutsideShift: 3.0,
      },
      [EmployeeType.Parttime]: {
        workdayOutsideShift: 1.5,
        weekendInsideShiftFulltime: 1.0,
        weekendInsideShiftParttime: 2.0,
        weekendOutsideShift: 3.0,
      },
      [EmployeeType.Probation]: {
        workdayOutsideShift: 1.5,
        weekendInsideShiftFulltime: 1.0,
        weekendInsideShiftParttime: 2.0,
        weekendOutsideShift: 3.0,
      },
    },
    allowances: {
      transportation: 1000,
      meal: {
        [EmployeeType.Fulltime]: 0,
        [EmployeeType.Parttime]: 30,
        [EmployeeType.Probation]: 0,
      },
      housing: 1000,
    },
    deductions: {
      socialSecurityRate: 0.05,
      socialSecurityMinBase: 1650,
      socialSecurityMaxBase: 15000,
    },
    rules: {
      overtimeMinimumMinutes: 30,
      roundOvertimeTo: 30,
      payrollPeriodStart: 26,
      payrollPeriodEnd: 25,
    },
  };

  describe('calculateOvertimePay', () => {
    it('should calculate overtime pay correctly for full-time employees', () => {
      const hours = {
        regularHours: 160,
        workdayOvertimeHours: 10,
        weekendShiftOvertimeHours: 8,
        holidayOvertimeHours: 4,
      };
      const baseRate = 100;

      const result = PayrollUtils.calculateOvertimePay(
        hours,
        baseRate,
        EmployeeType.Fulltime,
        mockSettings,
      );

      // Workday: 10 * 100 * 1.5 = 1500
      // Weekend: 8 * 100 * 1.0 = 800
      // Holiday: 4 * 100 * 3.0 = 1200
      expect(result).toBe(3500);
    });
  });

  describe('calculateSocialSecurity', () => {
    it('should cap social security at maximum base', () => {
      const grossPay = 20000;
      const result = PayrollUtils.calculateSocialSecurity(
        grossPay,
        mockSettings,
      );
      // Should cap at 15000 * 0.05 = 750
      expect(result).toBe(750);
    });

    it('should use minimum base for low gross pay', () => {
      const grossPay = 1000;
      const result = PayrollUtils.calculateSocialSecurity(
        grossPay,
        mockSettings,
      );
      // Should use minimum 1650 * 0.05 = 82.5
      expect(result).toBe(82.5);
    });
  });

  describe('validatePayrollData', () => {
    it('should validate complete payroll data', () => {
      const validData: PayrollCalculationResult = {
        employee: {
          id: '1',
          employeeId: 'EMP001',
          name: 'John Doe',
          departmentName: 'IT',
          role: 'Developer',
          employeeType: EmployeeType.Fulltime,
        },
        summary: {
          totalWorkingDays: 22,
          totalPresent: 20,
          totalAbsent: 2,
        },
        hours: {
          regularHours: 160,
          workdayOvertimeHours: 10,
          weekendShiftOvertimeHours: 8,
          holidayOvertimeHours: 4,
        },
        attendance: {
          totalLateMinutes: 30,
          earlyDepartures: 0,
        },
        leaves: {
          sick: 1,
          annual: 1,
          business: 0,
          holidays: 0,
          unpaid: 0,
        },
        rates: {
          regularHourlyRate: 100,
          overtimeRate: 1.5,
        },
        processedData: {
          basePay: 16000,
          overtimePay: 3500,
          allowances: {
            transportation: 1000,
            meal: 0,
            housing: 1000,
          },
          deductions: {
            socialSecurity: 750,
            tax: 0,
            unpaidLeave: 0,
            total: 750,
          },
          netPayable: 20750,
        },
      };

      const { isValid, errors } = PayrollUtils.validatePayrollData(validData);
      expect(isValid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidData = {
        employee: {
          name: 'John Doe',
        },
        processedData: {},
      } as unknown as PayrollCalculationResult;

      const { isValid, errors } = PayrollUtils.validatePayrollData(invalidData);
      expect(isValid).toBe(false);
      expect(errors).toContain('Missing employee ID');
      expect(errors).toContain('Missing net payable amount');
    });
  });
});
