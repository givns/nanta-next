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

// Helper function to safely parse JSON with a default value
function safeParseJSON<T>(jsonString: string | null, defaultValue: T): T {
  if (!jsonString) return defaultValue;
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return defaultValue;
  }
}

// Helper function to safely stringify with type assertion
function safeStringifyJSON(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return '{}';
  }
}

async function initializeSettings() {
  try {
    // Use upsert to either create or update settings
    const settings = await prisma.payrollSettings.upsert({
      where: {
        id: 'default-settings',
      },
      update: {}, // No updates if exists
      create: {
        id: 'default-settings',
        overtimeRates: JSON.stringify(DEFAULT_SETTINGS.overtimeRates),
        allowances: JSON.stringify(DEFAULT_SETTINGS.allowances),
        deductions: JSON.stringify(DEFAULT_SETTINGS.deductions),
        rules: JSON.stringify(DEFAULT_SETTINGS.rules),
      },
    });

    return settings;
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

    // Parse stored JSON with defaults
    const parsedSettings: PayrollSettingsData = {
      overtimeRates: safeParseJSON(
        settings.overtimeRates as string,
        DEFAULT_SETTINGS.overtimeRates,
      ),
      allowances: safeParseJSON(
        settings.allowances as string,
        DEFAULT_SETTINGS.allowances,
      ),
      deductions: safeParseJSON(
        settings.deductions as string,
        DEFAULT_SETTINGS.deductions,
      ),
      rules: safeParseJSON(settings.rules as string, DEFAULT_SETTINGS.rules),
    };

    return res.status(200).json({ data: parsedSettings });
  } catch (error) {
    console.error('Error getting settings:', error);
    // Always return default settings on error
    return res.status(200).json({ data: DEFAULT_SETTINGS });
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

    // Ensure settings exist before updating
    let settings = await prisma.payrollSettings.findFirst();
    if (!settings) {
      settings = await initializeSettings();
    }
    // Convert data to Prisma-compatible format
    const prismaData: Prisma.PayrollSettingsCreateInput = {
      id: 'default-settings',
      overtimeRates: safeStringifyJSON(settingsData.overtimeRates),
      allowances: safeStringifyJSON(settingsData.allowances),
      deductions: safeStringifyJSON(settingsData.deductions),
      rules: safeStringifyJSON(settingsData.rules),
    };

    // Store settings using Prisma's types
    const updatedSettings = await prisma.payrollSettings.upsert({
      where: {
        id: 'default-settings',
      },
      create: prismaData,
      update: {
        overtimeRates: prismaData.overtimeRates,
        allowances: prismaData.allowances,
        deductions: prismaData.deductions,
        rules: prismaData.rules,
      },
    });

    // Parse and return the updated settings
    const parsedSettings: PayrollSettingsData = {
      overtimeRates: safeParseJSON(
        updatedSettings.overtimeRates as string,
        DEFAULT_SETTINGS.overtimeRates,
      ),
      allowances: safeParseJSON(
        updatedSettings.allowances as string,
        DEFAULT_SETTINGS.allowances,
      ),
      deductions: safeParseJSON(
        updatedSettings.deductions as string,
        DEFAULT_SETTINGS.deductions,
      ),
      rules: safeParseJSON(
        updatedSettings.rules as string,
        DEFAULT_SETTINGS.rules,
      ),
    };

    return res.status(200).json({ data: parsedSettings });
  } catch (error) {
    console.error('Error updating settings:', error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to update settings',
    });
  }
}
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
