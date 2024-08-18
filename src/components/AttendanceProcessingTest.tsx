import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PayrollPeriod {
  start: string;
  end: string;
}

interface PayrollPeriods {
  current: PayrollPeriod;
  previous: PayrollPeriod;
}

export default function AttendanceProcessingTest() {
  const [employeeId, setEmployeeId] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'processing' | 'completed' | 'failed'
  >('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [payrollPeriod, setPayrollPeriod] =
    useState<keyof PayrollPeriods>('current');
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriods>({
    current: { start: '', end: '' },
    previous: { start: '', end: '' },
  });

  useEffect(() => {
    const periods = calculatePayrollPeriods();
    setPayrollPeriods(periods);
  }, []);

  const initiateProcessing = async () => {
    try {
      setStatus('processing');
      setLogs([]);
      const response = await axios.post('/api/test-payroll-processing', {
        employeeId,
        payrollPeriod,
        periodDates: payrollPeriods[payrollPeriod],
      });
      setJobId(response.data.jobId);
    } catch (err) {
      setError('Failed to initiate processing');
      setStatus('failed');
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      if (jobId && status === 'processing') {
        try {
          const response = await axios.get(
            `/api/check-payroll-processing?jobId=${jobId}&employeeId=${employeeId}`,
          );

          if (response.data.status === 'completed') {
            setStatus('completed');
            setResult(response.data.data);
            setLogs(response.data.logs || []);
          } else if (response.data.status === 'failed') {
            setStatus('failed');
            setError('Processing failed');
            setLogs(response.data.logs || []);
          } else {
            setLogs(response.data.logs || []);
            setTimeout(checkStatus, 5000); // Check again after 5 seconds
          }
        } catch (err) {
          setError('Failed to check processing status');
          setStatus('failed');
        }
      }
    };

    checkStatus();
  }, [jobId, status, employeeId]);

  function calculatePayrollPeriods(currentDate = new Date()): {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  } {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();

    let currentStart: Date;
    let currentEnd: Date;

    if (day < 26) {
      // Current period started last month
      currentStart = new Date(year, month - 1, 26);
      currentEnd = new Date(year, month, 25);
    } else {
      // Current period starts this month
      currentStart = new Date(year, month, 26);
      currentEnd = new Date(year, month + 1, 25);
    }

    const previousStart = new Date(currentStart);
    previousStart.setMonth(previousStart.getMonth() - 1);
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(previousEnd.getDate() - 1);

    return {
      current: {
        start: currentStart.toISOString().split('T')[0],
        end: currentEnd.toISOString().split('T')[0],
      },
      previous: {
        start: previousStart.toISOString().split('T')[0],
        end: previousEnd.toISOString().split('T')[0],
      },
    };
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getOvertimeFlag = (date: string) => {
    if (!result || !result.userData || !result.userData.potentialOvertimes) {
      return false;
    }
    return result.userData.potentialOvertimes.some(
      (ot: any) => ot.date && ot.date.startsWith(date.split('T')[0]),
    );
  };

  const getShiftAdjustmentFlag = (date: string) => {
    if (!result?.shiftAdjustments) return false;
    return result.shiftAdjustments.some((adj: any) =>
      adj.date.startsWith(date.split('T')[0]),
    );
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    const [datePart, timePart] = timeString.split(' ');
    return timePart || 'N/A';
  };

  const formatNumber = (value: number | undefined | null) => {
    return value !== undefined && value !== null ? value.toFixed(2) : 'N/A';
  };

  const formatOvertimePeriods = (periods: any[]) => {
    if (!periods || periods.length === 0) return 'N/A';
    return periods
      .map((period) => `${period.start} - ${period.end}`)
      .join(', ');
  };

  // Function to display date range (adjust the end date for display)
  const displayDateRange = (start: string, end: string) => {
    const endDate = new Date(end);
    endDate.setDate(endDate.getDate() - 1);
    return `${start} to ${endDate.toISOString().split('T')[0]}`;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Attendance Processing Test</h1>
      <div className="flex flex-col space-y-2 mb-4">
        <Input
          type="text"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Enter Employee ID"
          className="max-w-xs"
        />
        <Select
          value={payrollPeriod}
          onValueChange={(value: keyof PayrollPeriods) =>
            setPayrollPeriod(value)
          }
        >
          <SelectTrigger className="max-w-xs">
            <SelectValue placeholder="Select payroll period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">
              Current Period (
              {displayDateRange(
                payrollPeriods.current.start,
                payrollPeriods.current.end,
              )}
              )
            </SelectItem>
            <SelectItem value="previous">
              Previous Period (
              {displayDateRange(
                payrollPeriods.previous.start,
                payrollPeriods.previous.end,
              )}
              )
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={initiateProcessing}
          disabled={status === 'processing' || !employeeId}
        >
          {status === 'processing' ? 'Processing...' : 'Process Attendance'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status === 'completed' && result && (
        <>
          <Card className="mb-4">
            <CardHeader>
              <h2 className="text-xl font-semibold">Regular Attendance</h2>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Check-In Time</th>
                    <th>Check-Out Time</th>
                    <th>Status</th>
                    <th>Regular Hours</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.processedAttendance.map((record: any) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.date)}</td>
                      <td>{formatTime(record.checkIn)}</td>
                      <td>{formatTime(record.checkOut)}</td>
                      <td>{record.status}</td>
                      <td>{formatNumber(record.regularHours)}</td>
                      <td>{record.detailedStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <h2 className="text-xl font-semibold">Overtime Summary</h2>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Approved Overtime</th>
                    <th>Potential Overtime</th>
                    <th>Potential Overtime Periods</th>
                    <th>Off-Day Work</th>
                  </tr>
                </thead>
                <tbody>
                  {result.processedAttendance.map((record: any) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.date)}</td>
                      <td>{formatNumber(record.overtimeHours)}</td>
                      <td>{formatNumber(record.overtimeDuration)}</td>
                      <td>
                        {formatOvertimePeriods(record.potentialOvertimePeriods)}
                      </td>
                      <td>{record.status === 'off' ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Period Summary</h2>
            </CardHeader>
            <CardContent>
              <ul>
                <li>
                  Total Working Days in Period:{' '}
                  {result.summary.totalWorkingDays}
                </li>
                <li>
                  Days Present: {result.summary.totalPresent} /{' '}
                  {result.summary.totalWorkingDays}
                </li>
                <li>Days Absent: {result.summary.totalAbsent}</li>
                <li>Days Off: {result.summary.totalDayOff}</li>
                <li>
                  Attendance Rate: {formatNumber(result.summary.attendanceRate)}
                  %
                </li>
                <li>
                  Total Approved Overtime:{' '}
                  {formatNumber(result.summary.totalOvertimeHours)} hours
                </li>
                <li>
                  Total Potential Overtime:{' '}
                  {formatNumber(result.summary.totalPotentialOvertimeHours)}{' '}
                  hours
                </li>
              </ul>
            </CardContent>
          </Card>

          {result.absentDays && result.absentDays.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <h2 className="text-xl font-semibold">Absent Days</h2>
              </CardHeader>
              <CardContent>
                <ul>
                  {result.absentDays.map((date: string) => (
                    <li key={date}>{formatDate(date)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
