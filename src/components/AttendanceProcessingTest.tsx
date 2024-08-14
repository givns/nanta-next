import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AttendanceProcessingTest() {
  const [employeeId, setEmployeeId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'processing' | 'completed' | 'failed'
  >('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [payrollPeriod, setPayrollPeriod] = useState<string>('current');

  const initiateProcessing = async () => {
    try {
      setStatus('processing');
      setLogs([]);
      const response = await axios.post('/api/test-payroll-processing', {
        employeeId,
        payrollPeriod,
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

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Attendance Processing Test</h1>
      <div className="flex flex-col space-y-2 mb-4">
        <input
          type="text"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Enter Employee ID"
          className="max-w-xs p-2 border rounded"
        />
        <select
          value={payrollPeriod}
          onChange={(e) => setPayrollPeriod(e.target.value)}
          className="max-w-xs p-2 border rounded"
        >
          <option value="current">Current Period</option>
          <option value="previous">Previous Period</option>
          <option value="next">Next Period</option>
        </select>
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
            <h2 className="text-xl font-semibold">Processed Attendance</h2>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
