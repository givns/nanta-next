import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { ProcessedAttendance, AttendanceStatusInfo } from '../types/user';
import { format, parseISO } from 'date-fns';

interface ProcessedAttendanceResult {
  processedAttendance: ProcessedAttendance[];
  summary: AttendanceStatusInfo;
}

interface Column {
  title: string;
  dataIndex: string;
  key: string;
  render?: (text: string, record: any) => React.ReactNode;
}

export default function AttendanceProcessingTest() {
  const [employeeId, setEmployeeId] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'processing' | 'completed' | 'failed'
  >('idle');
  const [result, setResult] = useState<ProcessedAttendanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current');
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);

  useEffect(() => {
    const periods = generatePayrollPeriods();
    setPayrollPeriods(periods);
  }, []);

  const initiateProcessing = useCallback(async () => {
    try {
      setStatus('processing');
      setResult(null);
      setError(null);
      const response = await axios.post('/api/test-payroll-processing', {
        employeeId,
        payrollPeriod: selectedPeriod,
      });
      console.log('Initiate processing response:', response.data);
      setJobId(response.data.jobId);
    } catch (err) {
      console.error('Error initiating processing:', err);
      setError('Failed to initiate processing');
      setStatus('failed');
    }
  }, [employeeId, selectedPeriod]);

  useEffect(() => {
    const checkStatus = async () => {
      if (jobId && status === 'processing') {
        try {
          const response = await axios.get(
            `/api/check-payroll-processing?jobId=${jobId}&employeeId=${employeeId}`,
          );

          console.log('API response:', response.data);

          if (response.data.status === 'completed') {
            setStatus('completed');
            if (response.data.data) {
              console.log('Completed job data:', response.data.data);
              setResult(response.data.data);
            } else {
              console.error('Completed job has no data');
              setError('Completed job returned no data');
            }
          } else if (response.data.status === 'failed') {
            setStatus('failed');
            setError(
              'Processing failed: ' +
                (response.data.message || 'Unknown error'),
            );
          } else {
            // Still processing, check again after a delay
            setTimeout(checkStatus, 5000);
          }
        } catch (err) {
          console.error('Error checking processing status:', err);
          setError('Failed to check processing status');
          setStatus('failed');
        }
      }
    };

    checkStatus();
  }, [jobId, status, employeeId]);

  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return 'N/A';
    return format(parseISO(dateString), 'yyyy-MM-dd');
  }, []);

  const formatTime = useCallback((timeString: string | undefined) => {
    if (!timeString) return 'N/A';
    return format(parseISO(timeString), 'HH:mm:ss');
  }, []);

  const formatNumber = useCallback((value: number | undefined | null) => {
    return value !== undefined && value !== null ? value.toFixed(2) : 'N/A';
  }, []);

  const columns: Column[] = useMemo(
    () => [
      {
        title: 'Date',
        dataIndex: 'date',
        key: 'date',
        render: (text) => formatDate(text),
      },
      {
        title: 'Check-In',
        dataIndex: 'checkIn',
        key: 'checkIn',
        render: (text) => formatTime(text),
      },
      {
        title: 'Check-Out',
        dataIndex: 'checkOut',
        key: 'checkOut',
        render: (text) => formatTime(text),
      },
      { title: 'Status', dataIndex: 'status', key: 'status' },
      {
        title: 'Regular Hours',
        dataIndex: 'regularHours',
        key: 'regularHours',
        render: (text) => formatNumber(parseFloat(text)),
      },
      {
        title: 'Overtime Hours',
        dataIndex: 'overtimeHours',
        key: 'overtimeHours',
        render: (text) => formatNumber(parseFloat(text)),
      },
      { title: 'Notes', dataIndex: 'detailedStatus', key: 'notes' },
    ],
    [formatDate, formatTime, formatNumber],
  );

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

      {status === 'processing' && (
        <Alert className="mb-4">
          <AlertDescription>Processing attendance data...</AlertDescription>
        </Alert>
      )}

      {status === 'completed' && result && (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Processed Attendance</h2>
          </CardHeader>
          <CardContent>
            {result.processedAttendance &&
            result.processedAttendance.length > 0 ? (
              <Table
                columns={columns}
                dataSource={result.processedAttendance}
              />
            ) : (
              <p>
                No attendance data available. Please check the console for more
                details.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {status === 'completed' &&
        (!result ||
          !result.processedAttendance ||
          result.processedAttendance.length === 0) && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              Processing completed, but no attendance data was returned. Please
              check the console for more details.
            </AlertDescription>
          </Alert>
        )}
    </div>
  );
}
