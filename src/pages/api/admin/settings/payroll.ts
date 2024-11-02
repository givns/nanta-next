// pages/api/admin/settings/payroll.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Define detailed types for settings
interface OvertimeRates {
  workdayOutsideShift: number;
  weekendInsideShiftFulltime: number;
  weekendInsideShiftParttime: number;
  weekendOutsideShift: number;
}

interface EmployeeTypeRates {
  fulltime: OvertimeRates;
  parttime: OvertimeRates;
  probation: OvertimeRates;
}

interface MealAllowances {
  fulltime: number;
  parttime: number;
  probation: number;
}

interface Allowances {
  transportation: number;
  meal: MealAllowances;
  housing: number;
}

interface Deductions {
  socialSecurityRate: number;
  socialSecurityMinBase: number;
  socialSecurityMaxBase: number;
}

interface Rules {
  payrollPeriodStart: number;
  payrollPeriodEnd: number;
  overtimeMinimumMinutes: number;
  roundOvertimeTo: number;
}

interface PayrollSettingsData {
  overtimeRates: EmployeeTypeRates;
  allowances: Allowances;
  deductions: Deductions;
  rules: Rules;
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  data?: PayrollSettingsData;
}

// Default settings as a constant
const DEFAULT_SETTINGS: PayrollSettingsData = {
  overtimeRates: {
    fulltime: {
      workdayOutsideShift: 1.5,
      weekendInsideShiftFulltime: 1.0,
      weekendInsideShiftParttime: 2.0,
      weekendOutsideShift: 3.0,
    },
    parttime: {
      workdayOutsideShift: 1.5,
      weekendInsideShiftFulltime: 1.0,
      weekendInsideShiftParttime: 2.0,
      weekendOutsideShift: 3.0,
    },
    probation: {
      workdayOutsideShift: 1.5,
      weekendInsideShiftFulltime: 1.0,
      weekendInsideShiftParttime: 2.0,
      weekendOutsideShift: 3.0,
    },
  },
  allowances: {
    transportation: 0,
    meal: {
      fulltime: 0,
      parttime: 30,
      probation: 0,
    },
    housing: 0,
  },
  deductions: {
    socialSecurityRate: 0.05,
    socialSecurityMinBase: 1650,
    socialSecurityMaxBase: 15000,
  },
  rules: {
    payrollPeriodStart: 26,
    payrollPeriodEnd: 25,
    overtimeMinimumMinutes: 30,
    roundOvertimeTo: 30,
  },
};

async function initializeSettings() {
  try {
    // Find existing settings first
    const existingSettings = await prisma.payrollSettings.findFirst();

    if (existingSettings) {
      return existingSettings;
    }

    // Create new settings if none exist
    const newSettings = await prisma.payrollSettings.create({
      data: {
        // For MongoDB, let Prisma auto-generate the ObjectId
        overtimeRates: DEFAULT_SETTINGS.overtimeRates as any,
        allowances: DEFAULT_SETTINGS.allowances as any,
        deductions: DEFAULT_SETTINGS.deductions as any,
        rules: DEFAULT_SETTINGS.rules as any,
      },
    });

    return newSettings;
  } catch (error) {
    console.error('Error initializing settings:', error);
    throw error;
  }
}

async function getSettings(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  try {
    let settings = await prisma.payrollSettings.findFirst();

    // If no settings exist, initialize them
    if (!settings) {
      console.log('No settings found, initializing defaults...');
      settings = await initializeSettings();
      console.log('Default settings created:', settings);
    }

    // With MongoDB Json type, we don't need to parse the values
    const formattedSettings: PayrollSettingsData = {
      overtimeRates: settings.overtimeRates as any,
      allowances: settings.allowances as any,
      deductions: settings.deductions as any,
      rules: settings.rules as any,
    };

    return res.status(200).json({
      success: true,
      data: formattedSettings,
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    return res.status(200).json({
      success: true,
      data: DEFAULT_SETTINGS,
    });
  }
}

async function updateSettings(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  try {
    const settingsData = req.body as PayrollSettingsData;

    // Validate required fields
    if (
      !settingsData.overtimeRates ||
      !settingsData.allowances ||
      !settingsData.deductions ||
      !settingsData.rules
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required settings data',
      });
    }

    // Find existing settings
    let settings = await prisma.payrollSettings.findFirst();

    if (!settings) {
      // If no settings exist, create new
      settings = await prisma.payrollSettings.create({
        data: {
          overtimeRates: settingsData.overtimeRates as any,
          allowances: settingsData.allowances as any,
          deductions: settingsData.deductions as any,
          rules: settingsData.rules as any,
        },
      });
    } else {
      // Update existing settings
      settings = await prisma.payrollSettings.update({
        where: {
          id: settings.id, // Use the existing settings id
        },
        data: {
          overtimeRates: settingsData.overtimeRates as any,
          allowances: settingsData.allowances as any,
          deductions: settingsData.deductions as any,
          rules: settingsData.rules as any,
        },
      });
    }

    // Return the updated settings
    const formattedSettings: PayrollSettingsData = {
      overtimeRates: settings.overtimeRates as any,
      allowances: settings.allowances as any,
      deductions: settings.deductions as any,
      rules: settings.rules as any,
    };

    return res.status(200).json({
      success: true,
      data: formattedSettings,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to update settings',
    });
  }
}

// Main handler remains the same...
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify admin access
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true },
    });

    if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    switch (req.method) {
      case 'GET':
        return await getSettings(req, res);
      case 'POST':
        return await updateSettings(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res
          .status(405)
          .json({ error: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('PayrollSettings API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
