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
        <>
          <Card className="mb-4">
            <CardHeader>
              <h2 className="text-xl font-semibold">Regular Attendance</h2>
            </CardHeader>
            <CardContent>
              <Table
                columns={attendanceColumns}
                dataSource={result.processedAttendance}
              />
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
        </>
      )}

      {logs.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <h2 className="text-xl font-semibold">Processing Logs</h2>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5">
              {logs.map((log, index) => (
                <li key={index}>{log}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
