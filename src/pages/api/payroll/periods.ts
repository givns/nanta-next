// pages/api/payroll/periods.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { employeeId } = req.query;

    if (!employeeId || typeof employeeId !== 'string') {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    const user = await prisma.user.findUnique({
      where: { employeeId },
      select: { employeeType: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get payroll settings based on employee type
    const settings = await prisma.payrollSettings.findFirst({
      where: { employeeType: user.employeeType },
    });

    return res.status(200).json(settings);
  } catch (error) {
    console.error('Error fetching payroll settings:', error);
    return res.status(500).json({ error: 'Failed to fetch payroll settings' });
  }
}
