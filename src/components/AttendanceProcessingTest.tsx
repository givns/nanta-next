import React, { useState, useEffect, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
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

interface ProcessedAttendanceResult {
  processedAttendance: any[];
  summary: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
    totalIncomplete: number;
    totalHolidays: number;
    totalDayOff: number;
    totalRegularHours: number;
    expectedRegularHours: number;
    totalOvertimeHours: number;
    totalPotentialOvertimeHours: number;
    attendanceRate: number;
  };
  payrollPeriod: {
    start: string;
    end: string;
  };
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
    if (!dateString) return 'N/A';
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

  const Row = ({
    index,
    style,
    data,
  }: {
    index: number;
    style: React.CSSProperties;
    data: any[];
  }) => {
    const record = data[index];
    return (
      <div style={style} className="flex items-center border-b">
        <div className="flex-1 p-2">{formatDate(record.date)}</div>
        <div className="flex-1 p-2">{formatTime(record.checkIn)}</div>
        <div className="flex-1 p-2">{formatTime(record.checkOut)}</div>
        <div className="flex-1 p-2">{record.status}</div>
        <div className="flex-1 p-2">{formatNumber(record.regularHours)}</div>
        <div className="flex-1 p-2">{formatNumber(record.overtimeHours)}</div>
        <div className="flex-1 p-2">{record.detailedStatus}</div>
      </div>
    );
  };

  const VirtualizedTable = ({ data }: { data: any[] }) => {
    return (
      <List
        height={400}
        itemCount={data.length}
        itemSize={35}
        width="100%"
        itemData={data}
      >
        {Row}
      </List>
    );
  };

  const getWeeks = useMemo(
    () => (attendanceData: any[]) => {
      if (
        !attendanceData ||
        !Array.isArray(attendanceData) ||
        attendanceData.length === 0
      ) {
        console.warn('Invalid or empty attendance data');
        return [];
      }

      const sortedData = [...attendanceData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const firstDate = parseISO(sortedData[0].date);
      const lastDate = parseISO(sortedData[sortedData.length - 1].date);

      const weeks = [];
      let currentStart = startOfWeek(firstDate, { weekStartsOn: 1 });

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
    },
    [],
  );

  const calculateWeeklySummary = useMemo(
    () => (weekData: any[]) => {
      if (!weekData || !Array.isArray(weekData) || weekData.length === 0) {
        console.warn('Invalid or empty week data');
        return 'No data available';
      }

      const workingDays = weekData.filter(
        (day) => day && day.status !== 'off' && day.status !== 'holiday',
      ).length;
      const presentDays = weekData.filter(
        (day) => day && day.status === 'present',
      ).length;
      const totalRegularHours = weekData.reduce(
        (sum, day) => sum + (day && day.regularHours ? day.regularHours : 0),
        0,
      );
      const totalOvertimeHours = weekData.reduce(
        (sum, day) => sum + (day && day.overtimeHours ? day.overtimeHours : 0),
        0,
      );
      const totalPotentialOvertimeHours = weekData.reduce(
        (sum, day) =>
          sum + (day && day.overtimeDuration ? day.overtimeDuration : 0),
        0,
      );

      return `${workingDays} working days, ${presentDays} present, ${formatNumber(totalRegularHours)} regular hours, ${formatNumber(totalOvertimeHours)} overtime hours, ${formatNumber(totalPotentialOvertimeHours)} potential overtime hours`;
    },
    [],
  );

  function isValidResult(result: any): result is ProcessedAttendanceResult {
    if (!result) {
      console.log('Result is null or undefined');
      return false;
    }
    if (!Array.isArray(result.processedAttendance)) {
      console.log('processedAttendance is not an array');
      return false;
    }
    if (typeof result.summary !== 'object' || result.summary === null) {
      console.log('summary is not an object or is null');
      return false;
    }
    if (
      typeof result.payrollPeriod !== 'object' ||
      result.payrollPeriod === null
    ) {
      console.log('payrollPeriod is not an object or is null');
      return false;
    }
    if (
      typeof result.payrollPeriod.start !== 'string' ||
      typeof result.payrollPeriod.end !== 'string'
    ) {
      console.log('payrollPeriod start or end is not a string');
      return false;
    }
    return true;
  }

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

      {status === 'completed' && result && isValidResult(result) && (
        <div className="space-y-8">
          {getWeeks(result.processedAttendance).map((week, index) => {
            const weekData = result.processedAttendance.filter(
              (row: any) => row.date >= week.start && row.date <= week.end,
            );

            return (
              <Card key={index} className="mb-4">
                <CardHeader>
                  <h3 className="text-base font-bold">
                    Week {index + 1} ({formatDate(week.start)} -{' '}
                    {formatDate(week.end)})
                  </h3>
                </CardHeader>
                <CardContent>
                  <div className="flex font-bold mb-2">
                    <div className="flex-1 p-2">Date</div>
                    <div className="flex-1 p-2">Check-In</div>
                    <div className="flex-1 p-2">Check-Out</div>
                    <div className="flex-1 p-2">Status</div>
                    <div className="flex-1 p-2">Regular Hours</div>
                    <div className="flex-1 p-2">Overtime Hours</div>
                    <div className="flex-1 p-2">Notes</div>
                  </div>
                  <VirtualizedTable data={weekData} />
                  <p className="mt-2 text-sm font-semibold">
                    Weekly Summary: {calculateWeeklySummary(weekData)}
                  </p>
                </CardContent>
              </Card>
            );
          })}

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
                <li>
                  Total Present Days: {result.summary.totalPresent} /{' '}
                  {result.summary.totalWorkingDays}
                </li>
                <li>Total Absent Days: {result.summary.totalAbsent}</li>
                <li>
                  Total Incomplete Days: {result.summary.totalIncomplete || 0}
                </li>
                <li>Total Holidays: {result.summary.totalHolidays || 0}</li>
                <li>Total Day Off: {result.summary.totalDayOff || 0}</li>
                <li>
                  Total Regular Hours:{' '}
                  {formatNumber(result.summary.totalRegularHours)} /{' '}
                  {formatNumber(result.summary.expectedRegularHours)}
                </li>
                <li>
                  Total Overtime Hours:{' '}
                  {formatNumber(result.summary.totalOvertimeHours)}
                </li>
                <li>
                  Total Potential Overtime Hours:{' '}
                  {formatNumber(result.summary.totalPotentialOvertimeHours)}
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
