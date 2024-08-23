import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AttendanceRecord, ProcessedAttendance } from '../types/user';
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  addDays,
  isValid,
  isSameDay,
  parse,
  setDate,
  addMonths,
  subMonths,
} from 'date-fns';

interface ProcessedAttendanceResult {
  processedAttendance: ProcessedAttendance[];
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

interface PayrollPeriod {
  value: string;
  label: string;
  start: string;
  end: string;
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

  const generatePayrollPeriods = useCallback(() => {
    const periods: PayrollPeriod[] = [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    for (let i = 0; i < 12; i++) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const periodStart = setDate(subMonths(date, 1), 26);
      const periodEnd = setDate(date, 25);

      periods.push({
        value: format(date, 'MMMM-yyyy').toLowerCase(),
        label: format(date, 'MMMM yyyy'),
        start: format(periodStart, 'yyyy-MM-dd'),
        end: format(periodEnd, 'yyyy-MM-dd'),
      });
    }

    periods.unshift({
      value: 'current',
      label: 'Current Period',
      start: format(
        now.getDate() < 26 ? setDate(subMonths(now, 1), 26) : setDate(now, 26),
        'yyyy-MM-dd',
      ),
      end: format(
        now.getDate() < 26 ? setDate(now, 25) : setDate(addMonths(now, 1), 25),
        'yyyy-MM-dd',
      ),
    });

    return periods;
  }, []);

  useEffect(() => {
    const periods = generatePayrollPeriods();
    setPayrollPeriods(periods);
  }, [generatePayrollPeriods]);

  const initiateProcessing = useCallback(async () => {
    try {
      setStatus('processing');
      setLogs([]);
      setError(null);
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
            setError(response.data.error || 'Processing failed');
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
    const date = parseISO(dateString);
    return isValid(date) ? format(date, 'yyyy-MM-dd') : 'Invalid Date';
  }, []);

  const formatTime = useCallback((timeString: string) => {
    if (!timeString) return 'N/A';
    const date = parseISO(timeString);
    return isValid(date) ? format(date, 'HH:mm:ss') : 'Invalid Time';
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
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const record = result?.processedAttendance[index];
      if (!record) return null;
      return (
        <div style={style} className="flex items-center border-b">
          <div className="flex-1 p-2">{formatDate(record.date.toString())}</div>
          <div className="flex-1 p-2">{formatTime(record.checkIn || '')}</div>
          <div className="flex-1 p-2">{formatTime(record.checkOut || '')}</div>
          <div className="flex-1 p-2">{record.status}</div>
          <div className="flex-1 p-2">{formatNumber(record.regularHours)}</div>
          <div className="flex-1 p-2">{formatNumber(record.overtimeHours)}</div>
          <div className="flex-1 p-2">{record.detailedStatus}</div>
        </div>
      );
    },
    [result, formatDate, formatTime, formatNumber],
  );

  const VirtualizedTable = useCallback(
    ({ itemCount }: { itemCount: number }) => {
      return (
        <List height={400} itemCount={itemCount} itemSize={35} width="100%">
          {Row}
        </List>
      );
    },
    [Row],
  );

  const getWeeks = useMemo(
    () => (attendanceData: ProcessedAttendance[]) => {
      if (!attendanceData || attendanceData.length === 0) {
        console.warn('Invalid or empty attendance data');
        return [];
      }

      const sortedData = [...attendanceData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const firstDate = new Date(sortedData[0].date);
      const lastDate = new Date(sortedData[sortedData.length - 1].date);

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
    (weekData: ProcessedAttendance[]) => {
      if (!weekData || weekData.length === 0) {
        return 'No data available';
      }

      const workingDays = weekData.filter(
        (day) => day.status !== 'off' && day.status !== 'holiday',
      ).length;
      const presentDays = weekData.filter(
        (day) => day.status === 'present',
      ).length;
      const totalRegularHours = weekData.reduce(
        (sum, day) => sum + (day.regularHours || 0),
        0,
      );
      const totalOvertimeHours = weekData.reduce(
        (sum, day) => sum + (day.overtimeHours || 0),
        0,
      );

      return `${workingDays} working days, ${presentDays} present, ${formatNumber(
        totalRegularHours,
      )} regular hours, ${formatNumber(totalOvertimeHours)} overtime hours`;
    },
    [formatNumber],
  );

  const renderWeekData = useCallback(
    (
      week: { start: string; end: string },
      index: number,
      weekData: ProcessedAttendance[],
    ) => (
      <Card key={index} className="mb-4">
        <CardHeader>
          <h3 className="text-base font-bold">
            Week {index + 1} ({formatDate(week.start)} - {formatDate(week.end)})
          </h3>
        </CardHeader>
        <CardContent>
          {weekData.length > 0 ? (
            <>
              <VirtualizedTable itemCount={weekData.length} />
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
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Total Working Days:</span>
              <span>{result.summary.totalWorkingDays}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Present Days:</span>
              <span>
                {result.summary.totalPresent} /{' '}
                {result.summary.totalWorkingDays}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Absent Days:</span>
              <span>{result.summary.totalAbsent}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Incomplete Days:</span>
              <span>{result.summary.totalIncomplete || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Holidays:</span>
              <span>{result.summary.totalHolidays || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Day Off:</span>
              <span>{result.summary.totalDayOff || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Regular Hours:</span>
              <span>
                {formatNumber(result.summary.totalRegularHours)} /{' '}
                {formatNumber(result.summary.expectedRegularHours)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Overtime Hours:</span>
              <span>{formatNumber(result.summary.totalOvertimeHours)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Potential Overtime Hours:</span>
              <span>
                {formatNumber(result.summary.totalPotentialOvertimeHours)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Attendance Rate:</span>
              <span>{formatNumber(result.summary.attendanceRate)}%</span>
            </div>
          </div>
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
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status === 'processing' && (
        <div className="mt-4">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
            <p>Processing attendance data... This may take a few minutes.</p>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {logs.map((log, index) => (
              <p key={index} className="text-sm text-gray-600">
                {log}
              </p>
            ))}
          </div>
        </div>
      )}

      {status === 'completed' && result && (
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">
                Payroll Period: {formatDate(result.payrollPeriod.start)} to{' '}
                {formatDate(result.payrollPeriod.end)}
              </h3>
            </CardHeader>
            <CardContent>
              <Table columns={[]} dataSource={[]}>
                <TableBody>
                  <TableRow>
                    <TableCell>Total Working Days</TableCell>
                    <TableCell>{result.summary.totalWorkingDays}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Present Days</TableCell>
                    <TableCell>
                      {result.summary.totalPresent} /{' '}
                      {result.summary.totalWorkingDays}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Absent Days</TableCell>
                    <TableCell>{result.summary.totalAbsent}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Incomplete Days</TableCell>
                    <TableCell>{result.summary.totalIncomplete}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Holidays</TableCell>
                    <TableCell>{result.summary.totalHolidays}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Day Off</TableCell>
                    <TableCell>{result.summary.totalDayOff}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Regular Hours</TableCell>
                    <TableCell>
                      {formatNumber(result.summary.totalRegularHours)} /{' '}
                      {formatNumber(result.summary.expectedRegularHours)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Overtime Hours</TableCell>
                    <TableCell>
                      {formatNumber(result.summary.totalOvertimeHours)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Potential Overtime Hours</TableCell>
                    <TableCell>
                      {formatNumber(result.summary.totalPotentialOvertimeHours)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Attendance Rate</TableCell>
                    <TableCell>
                      {formatNumber(result.summary.attendanceRate)}%
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {getWeeks(result.processedAttendance).map((week, index) => {
            const weekData = result.processedAttendance.filter((row) => {
              const rowDate = new Date(row.date);
              return (
                rowDate >= new Date(week.start) && rowDate <= new Date(week.end)
              );
            });
            return renderWeekData(week, index, weekData);
          })}
          {renderSummaryCard}
        </div>
      )}

      {status === 'failed' && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Processing Failed</AlertTitle>
          <AlertDescription>
            There was an error processing the attendance data. Please try again
            or contact support if the issue persists.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
