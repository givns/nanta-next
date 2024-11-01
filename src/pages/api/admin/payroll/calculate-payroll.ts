// pages/api/admin/payroll/calculate-payroll.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { PayrollCalculationService } from '@/services/PayrollCalculation/PayrollCalculationService';
import { parseISO, isValid } from 'date-fns';
import { PayrollApiResponse, PayrollCalculationResult } from '@/types/payroll';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PayrollApiResponse<PayrollCalculationResult>>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  const lineUserId = req.headers['x-line-userid'];
  if (!lineUserId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    const { employeeId, periodStart, periodEnd } = req.body;

    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
      });
    }

    // Parse and validate dates
    const startDate = parseISO(periodStart);
    const endDate = parseISO(periodEnd);

    if (!isValid(startDate) || !isValid(endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD',
      });
    }

    // Fetch required data
    const [employee, timeEntries, leaveRequests, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { employeeId },
        select: {
          id: true,
          employeeId: true,
          name: true,
          departmentName: true,
          role: true,
          employeeType: true,
          baseSalary: true,
          salaryType: true,
          bankAccountNumber: true,
        },
      }),
      prisma.timeEntry.findMany({
        where: {
          employeeId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          overtimeMetadata: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId,
          status: 'approved',
          startDate: {
            lte: endDate,
          },
          endDate: {
            gte: startDate,
          },
        },
      }),
      prisma.payrollSettings.findFirst(),
    ]);

    if (!employee || !settings) {
      return res.status(404).json({
        success: false,
        error: 'Employee or settings not found',
      });
    }

    // Initialize service and calculate payroll
    const payrollService = new PayrollCalculationService(
      JSON.parse(settings.overtimeRates as string),
      prisma,
    );

    const result = await payrollService.calculatePayroll(
      {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        departmentName: employee.departmentName,
        role: employee.role,
        employeeType: employee.employeeType,
        baseSalary: employee.baseSalary,
        salaryType: employee.salaryType,
        bankAccountNumber: employee.bankAccountNumber,
        // Required for type but not used in calculation
        lineUserId: null,
        nickname: null,
        departmentId: null,
        company: null,
        updatedAt: null,
        isGovernmentRegistered: '',
        workStartDate: null,
        profilePictureUrl: null,
        shiftId: null,
        shiftCode: null,
        overtimeHours: 0,
        sickLeaveBalance: 0,
        businessLeaveBalance: 0,
        annualLeaveBalance: 0,
        isPreImported: '',
        isRegistrationComplete: '',
      },
      timeEntries,
      leaveRequests,
      startDate,
      endDate,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Error calculating payroll',
    });
  }
}
