// pages/api/admin/settings/payroll.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify admin access
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true }
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
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('PayrollSettings API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getSettings(req: NextApiRequest, res: NextApiResponse) {
  const settings = await prisma.payrollSettings.findFirst();
  
  if (!settings) {
    // Return default settings if none exist
    const defaultSettings = {
      overtimeRates: {
        fulltime: {
          workdayOutsideShift: 1.5,
          weekendInsideShiftFulltime: 1.0,
          weekendInsideShiftParttime: 2.0,
          weekendOutsideShift: 3.0
        },
        parttime: {
          workdayOutsideShift: 1.5,
          weekendInsideShiftFulltime: 1.0,
          weekendInsideShiftParttime: 2.0,
          weekendOutsideShift: 3.0
        },
        probation: {
          workdayOutsideShift: 1.5,
          weekendInsideShiftFulltime: 1.0,
          weekendInsideShiftParttime: 2.0,
          weekendOutsideShift: 3.0
        }
      },
      allowances: {
        transportation: 0,
        meal: {
          fulltime: 0,
          parttime: 30,
          probation: 0
        },
        housing: 0
      },
      deductions: {
        socialSecurityRate: 0.05,
        socialSecurityMinBase: 1650,
        socialSecurityMaxBase: 15000
      },
      rules: {
        payrollPeriodStart: 26,
        payrollPeriodEnd: 25,
        overtimeMinimumMinutes: 30,
        roundOvertimeTo: 30
      }
    };
    
    return res.status(200).json(defaultSettings);
  }
  
  return res.status(200).json({
    overtimeRates: JSON.parse(settings.overtimeRates as string),
    allowances: JSON.parse(settings.allowances as string),
    deductions: JSON.parse(settings.deductions as string),
    rules: JSON.parse(settings.overtimeRates as string).rules || {
      payrollPeriodStart: 26,
      payrollPeriodEnd: 25,
      overtimeMinimumMinutes: 30,
      roundOvertimeTo: 30
    }
  });
}

async function updateSettings(req: NextApiRequest, res: NextApiResponse) {
  const { overtimeRates, allowances, deductions, rules } = req.body;

  // Store settings as JSON strings
  const updatedSettings = await prisma.payrollSettings.upsert({
    where: {
      id: 'default-settings'
    },
    create: {
      id: 'default-settings',
      overtimeRates: JSON.stringify(overtimeRates),
      allowances: JSON.stringify(allowances),
      deductions: JSON.stringify(deductions)
    },
    update: {
      overtimeRates: JSON.stringify({ ...overtimeRates, rules }),
      allowances: JSON.stringify(allowances),
      deductions: JSON.stringify(deductions)
    }
  });

  return res.status(200).json({
    overtimeRates: JSON.parse(updatedSettings.overtimeRates as string),
    allowances: JSON.parse(updatedSettings.allowances as string),
    deductions: JSON.parse(updatedSettings.deductions as string),
    rules: JSON.parse(updatedSettings.overtimeRates as string).rules
  });
}