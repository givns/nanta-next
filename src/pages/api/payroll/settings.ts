// pages/api/payroll/settings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, EmployeeType } from '@prisma/client';
import type { PayrollSettings } from '@/types/payroll/api';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PayrollSettings | { error: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { employeeId } = req.query;

    if (!employeeId || typeof employeeId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid employeeId' });
    }

    // Get user's employment type and role
    const user = await prisma.user.findUnique({
      where: { employeeId },
      select: {
        employeeType: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For now, returning hardcoded settings based on employment type
    // In a real implementation, these would come from a settings table
    const settings: PayrollSettings = {
      regularHourlyRate:
        user.employeeType === EmployeeType.Fulltime ? 62.5 : 45,
      overtimeRates: {
        // Match the interface
        regular: 1.5,
        holiday: 2.0,
      },
      allowances: {
        transportation: user.employeeType === EmployeeType.Fulltime ? 1000 : 0,
        meal: user.employeeType === EmployeeType.Fulltime ? 1000 : 0,
        housing: user.employeeType === EmployeeType.Fulltime ? 1000 : 0,
      },
      deductions: {
        socialSecurity: 0.05, // 5% of base salary
        tax: 0, // Calculated based on total income
      },
      leaveSettings: {
        sickLeavePerYear: 30,
        annualLeavePerYear: 6,
        businessLeavePerYear: 3,
      },
      workingHours: {
        regularHoursPerDay: 8,
        regularDaysPerWeek: 6,
      },
    };

    res.status(200).json(settings);
  } catch (error) {
    console.error('Error in payroll settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
