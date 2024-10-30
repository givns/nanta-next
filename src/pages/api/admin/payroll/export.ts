// pages/api/payroll/export.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PayrollExportService } from '../../../../services/PayrollExportService';

const payrollExportService = new PayrollExportService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      const { startDate, endDate } = req.query;
      const buffer = await payrollExportService.generatePayrollExport(
        new Date(startDate as string),
        new Date(endDate as string),
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename=payroll.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('Error generating payroll export:', error);
      res.status(500).json({ message: 'Error generating payroll export' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
