import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import axios from 'axios';

interface TestResult {
  userData: any;
  payrollPeriod: {
    start: string;
    end: string;
  };
  processedAttendance: any[];
  summary: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
    overtimeHours: number;
  };
  leaveBalances: any;
  shiftAdjustments: any[];
  approvedOvertimes: any[];
  logs: string[];
}

export default function AttendanceProcessingTest() {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post<TestResult>(
        '/api/test-payroll-processing',
        { employeeId },
      );
      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Attendance Processing Test</h1>
      <div className="flex space-x-2 mb-4">
        <Input
          type="text"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Enter Employee ID"
          className="max-w-xs"
        />
        <Button onClick={runTest} disabled={loading}>
          {loading ? 'Processing...' : 'Run Test'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Data</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.userData, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payroll Period</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Start: {result.payrollPeriod.start}</p>
              <p>End: {result.payrollPeriod.end}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processed Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.processedAttendance, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Total Working Days: {result.summary.totalWorkingDays}</p>
              <p>Total Present: {result.summary.totalPresent}</p>
              <p>Total Absent: {result.summary.totalAbsent}</p>
              <p>Overtime Hours: {result.summary.overtimeHours}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leave Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.leaveBalances, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shift Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.shiftAdjustments, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approved Overtimes</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.approvedOvertimes, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processing Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-100 p-4 rounded-md">
                {result.logs.map((log, index) => (
                  <p key={index} className="text-sm">
                    {log}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
