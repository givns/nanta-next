import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [result, setResult] = useState<ProcessedAttendanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current');
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);

  useEffect(() => {
    const periods = generatePayrollPeriods();
    setPayrollPeriods(periods);
  }, []);

  const initiateProcessing = useCallback(async () => {
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
  }, [employeeId, selectedPeriod, payrollPeriods]);

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

  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }, []);

  const formatTime = useCallback((timeString: string) => {
    if (!timeString) return 'N/A';
    const [datePart, timePart] = timeString.split(' ');
    return timePart || 'N/A';
  }, []);

  const formatNumber = useCallback((value: number | undefined | null) => {
    return value !== undefined && value !== null ? value.toFixed(2) : 'N/A';
  }, []);

  const attendanceColumns = useMemo(
    () => [
      {
        title: 'Date',
        dataIndex: 'date',
        key: 'date',
        render: (text: string) => formatDate(text),
      },
      {
        title: 'Check-In',
        dataIndex: 'checkIn',
        key: 'checkIn',
        render: (text: string) => formatTime(text),
      },
      {
        title: 'Check-Out',
        dataIndex: 'checkOut',
        key: 'checkOut',
        render: (text: string) => formatTime(text),
      },
      { title: 'Status', dataIndex: 'status', key: 'status' },
      {
        title: 'Regular Hours',
        dataIndex: 'regularHours',
        key: 'regularHours',
        render: (text: string) => formatNumber(parseFloat(text)),
      },
      {
        title: 'Overtime Hours',
        dataIndex: 'overtimeHours',
        key: 'overtimeHours',
        render: (value: string) => formatNumber(parseFloat(value)),
      },
      { title: 'Notes', dataIndex: 'detailedStatus', key: 'notes' },
    ],
    [formatDate, formatTime, formatNumber],
  );

  const Row = useCallback(
    ({
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
    },
    [formatDate, formatTime, formatNumber],
  );

  const VirtualizedTable = useCallback(
    ({ data }: { data: any[] }) => {
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
    },
    [Row],
  );

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

  const calculateWeeklySummary = useCallback(
    (weekData: any[]) => {
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

      return `${workingDays} working days, ${presentDays} present, ${formatNumber(
        totalRegularHours,
      )} regular hours, ${formatNumber(totalOvertimeHours)} overtime hours, ${formatNumber(
        totalPotentialOvertimeHours,
      )} potential overtime hours`;
    },
    [formatNumber],
  );

  // Memoize the rendering of week data
  const renderWeekData = useCallback(
    (week: any, index: number, weekData: any[]) => (
      <Card key={index} className="mb-4">
        <CardHeader>
          <h3 className="text-base font-bold">
            Week {index + 1} ({formatDate(week.start)} - {formatDate(week.end)})
          </h3>
        </CardHeader>
        <CardContent>
          {weekData.length > 0 ? (
            <>
              <VirtualizedTable data={weekData} />
              <p className="mt-2 text-sm font-semibold">
                Weekly Summary: {calculateWeeklySummary(weekData)}
              </p>
            </>
          ) : (
            <p>No data available for this week</p>
          )}
        </CardContent>
      </Card>
    ),
    [formatDate, VirtualizedTable, calculateWeeklySummary],
  );

  // Memoize the rendering of the summary card
  const renderSummaryCard = useMemo(() => {
    if (!result || !result.summary) return null;

    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">
            Total Summary for{' '}
            {format(parseISO(result.payrollPeriod.start), 'MMMM yyyy')} Payroll
            Period
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
              Attendance Rate: {formatNumber(result.summary.attendanceRate)}%
            </li>
          </ul>
        </CardContent>
      </Card>
    );
  }, [result, formatNumber]);

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
          {getWeeks(result.processedAttendance).map((week, index) => {
            const weekData = result.processedAttendance.filter(
              (row: any) => row.date >= week.start && row.date <= week.end,
            );
            return renderWeekData(week, index, weekData);
          })}
          {renderSummaryCard}
        </div>
      )}
    </div>
  );
}
