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
import { generatePayrollPeriods, PayrollPeriod } from '../utils/payrollUtils';
import { AttendanceRecord } from '../types/user';
import { format, parseISO, startOfWeek, endOfWeek, addDays } from 'date-fns';

type Column = {
  title: string;
  dataIndex: string;
  key: string;
  render?: (text: string, record: AttendanceRecord) => React.ReactNode;
};

export default function AttendanceProcessingTest() {
  const [employeeId, setEmployeeId] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'processing' | 'completed' | 'failed'
  >('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current');
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);

  useEffect(() => {
    const periods = generatePayrollPeriods();
    setPayrollPeriods(periods);
  }, []);

  const initiateProcessing = async () => {
    try {
      setStatus('processing');
      setLogs([]);
      const period = payrollPeriods.find((p) => p.value === selectedPeriod);
      if (!period) {
        throw new Error('Invalid period selected');
      }
      const response = await axios.post('/api/test-payroll-processing', {
        employeeId,
        payrollPeriod: selectedPeriod,
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

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    const [datePart, timePart] = timeString.split(' ');
    return timePart || 'N/A';
  };

  const formatNumber = (value: number | undefined | null) => {
    return value !== undefined && value !== null ? value.toFixed(2) : 'N/A';
  };

  const attendanceColumns: Column[] = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (text) => formatDate(text),
    },
    {
      title: 'Check-In Time',
      dataIndex: 'checkIn',
      key: 'checkIn',
      render: (text) => formatTime(text),
    },
    {
      title: 'Check-Out Time',
      dataIndex: 'checkOut',
      key: 'checkOut',
      render: (text) => formatTime(text),
    },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    {
      title: 'Regular Hours',
      dataIndex: 'regularHours',
      key: 'regularHours',
      render: (text, record) => formatNumber(record.regularHours),
    },
    { title: 'Details', dataIndex: 'detailedStatus', key: 'detailedStatus' },
  ];

  const getWeeks = (attendanceData: any[]) => {
    if (!attendanceData || attendanceData.length === 0) return [];

    const sortedData = [...attendanceData].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const firstDate = parseISO(sortedData[0].date);
    const lastDate = parseISO(sortedData[sortedData.length - 1].date);

    const weeks = [];
    let currentStart = startOfWeek(firstDate, { weekStartsOn: 1 }); // Assuming week starts on Monday

    while (currentStart <= lastDate) {
      const currentEnd = endOfWeek(currentStart, { weekStartsOn: 1 });
      weeks.push({
        start: format(currentStart, 'yyyy-MM-dd'),
        end: format(
          currentEnd > lastDate ? lastDate : currentEnd,
          'yyyy-MM-dd',
        ),
      });
      currentStart = addDays(currentEnd, 1);
    }

    return weeks;
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
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="max-w-xs">
            <SelectValue placeholder="Select payroll period" />
          </SelectTrigger>
          <SelectContent>
            {payrollPeriods.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {period.label} ({period.start} to {period.end})
              </SelectItem>
            ))}
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
        <div className="space-y-8">
          {getWeeks(result.processedAttendance).map((week, index) => (
            <Card key={index} className="mb-4">
              <CardHeader>
                <h3 className="text-lg font-semibold">
                  Week {index + 1} ({formatDate(week.start)} -{' '}
                  {formatDate(week.end)})
                </h3>
              </CardHeader>
              <CardContent>
                <Table
                  columns={attendanceColumns}
                  dataSource={result.processedAttendance.filter(
                    (row: any) =>
                      row.date >= week.start && row.date <= week.end,
                  )}
                />
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">
                Total Summary for{' '}
                {format(parseISO(result.payrollPeriod.start), 'MMMM yyyy')}{' '}
                Payroll Period
              </h3>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside">
                <li>Total Working Days: {result.summary.totalWorkingDays}</li>
                <li>Total Present Days: {result.summary.totalPresent}</li>
                <li>Total Absent Days: {result.summary.totalAbsent}</li>
                <li>
                  Total Incomplete Days: {result.summary.totalIncomplete || 0}
                </li>
                <li>Total Holidays: {result.summary.totalHolidays || 0}</li>
                <li>Total Day Off: {result.summary.totalDayOff || 0}</li>
                <li>
                  Total Regular Hours:{' '}
                  {formatNumber(result.summary.totalRegularHours)}
                </li>
                <li>
                  Total Overtime Hours:{' '}
                  {formatNumber(result.summary.totalOvertimeHours)}
                </li>
                <li>
                  Attendance Rate: {formatNumber(result.summary.attendanceRate)}
                  %
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
