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

  const initiateProcessing = async () => {
    try {
      setStatus('processing');
      const response = await axios.post('/api/test-payroll-processing', {
        employeeId,
        startDate,
        endDate,
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
          } else if (response.data.status === 'failed') {
            setStatus('failed');
            setError('Processing failed');
          } else {
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
        <Input
          type="text"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Enter Employee ID"
          className="max-w-xs"
        />
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="Start Date"
          className="max-w-xs"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End Date"
          className="max-w-xs"
        />
        <Button
          onClick={initiateProcessing}
          disabled={
            status === 'processing' || !employeeId || !startDate || !endDate
          }
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
