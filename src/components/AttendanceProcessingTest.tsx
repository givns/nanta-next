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
  next: PayrollPeriod;
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
    next: { start: '', end: '' },
  });

  useEffect(() => {
    const calculatePayrollPeriods = () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const currentStart = new Date(currentYear, currentMonth, 26);
      if (now.getDate() < 26) {
        currentStart.setMonth(currentStart.getMonth() - 1);
      }
      const currentEnd = new Date(currentStart);
      currentEnd.setMonth(currentEnd.getMonth() + 1);
      currentEnd.setDate(25);

      const previousStart = new Date(currentStart);
      previousStart.setMonth(previousStart.getMonth() - 1);
      const previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);

      const nextStart = new Date(currentEnd);
      nextStart.setDate(nextStart.getDate() + 1);
      const nextEnd = new Date(nextStart);
      nextEnd.setMonth(nextEnd.getMonth() + 1);
      nextEnd.setDate(25);

      setPayrollPeriods({
        current: {
          start: currentStart.toISOString().split('T')[0],
          end: currentEnd.toISOString().split('T')[0],
        },
        previous: {
          start: previousStart.toISOString().split('T')[0],
          end: previousEnd.toISOString().split('T')[0],
        },
        next: {
          start: nextStart.toISOString().split('T')[0],
          end: nextEnd.toISOString().split('T')[0],
        },
      });
    };

    calculatePayrollPeriods();
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
              Current Period ({payrollPeriods.current.start} to{' '}
              {payrollPeriods.current.end})
            </SelectItem>
            <SelectItem value="previous">
              Previous Period ({payrollPeriods.previous.start} to{' '}
              {payrollPeriods.previous.end})
            </SelectItem>
            <SelectItem value="next">
              Next Period ({payrollPeriods.next.start} to{' '}
              {payrollPeriods.next.end})
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
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Attendance Summary</h2>
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
                  <th>Overtime Hours</th>
                  <th>Potential Overtime Flag</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.processedAttendance &&
                  result.processedAttendance.map((record: any) => (
                    <tr key={record.id}>
                      <td>{record.date ? formatDate(record.date) : 'N/A'}</td>
                      <td>
                        {record.checkIn ? record.checkIn.split(' ')[1] : 'N/A'}
                      </td>
                      <td>
                        {record.checkOut
                          ? record.checkOut.split(' ')[1]
                          : 'N/A'}
                      </td>
                      <td>{record.status || 'N/A'}</td>
                      <td>
                        {record.regularHours !== undefined
                          ? record.regularHours.toFixed(2)
                          : 'N/A'}
                      </td>
                      <td>
                        {record.overtimeHours !== undefined
                          ? record.overtimeHours
                          : 'N/A'}
                      </td>
                      <td>
                        {record.date && getOvertimeFlag(record.date)
                          ? 'Yes'
                          : 'No'}
                      </td>
                      <td>{record.detailedStatus || 'N/A'}</td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
