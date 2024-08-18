import { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '../../services/ExternalDbService';
import { HolidayService } from '../../services/HolidayService';
import { Shift104HolidayService } from '../../services/Shift104HolidayService';
import { leaveServiceServer } from '../../services/LeaveServiceServer';

const externalDbService = new ExternalDbService();
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();

const attendanceService = new AttendanceService(
  externalDbService,
  holidayService,
  shift104HolidayService,
  leaveServiceServer,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { employeeId, payrollPeriod, periodDates } = req.body;

  if (!employeeId || !payrollPeriod || !periodDates) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  console.log('Received payroll processing request:', {
    employeeId,
    payrollPeriod,
    periodDates,
  });

  try {
    const startDate = new Date(periodDates.start);
    const endDate = new Date(periodDates.end);
    endDate.setHours(23, 59, 59, 999);

    console.log(
      `Processing payroll for employee ${employeeId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    const result = await attendanceService.processPayroll(
      employeeId,
      startDate,
      endDate,
    );

    console.log('Payroll processing completed successfully');
    res
      .status(200)
      .json({ success: true, jobId: Date.now().toString(), data: result });
  } catch (error) {
    console.error('Error processing payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing payroll',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
