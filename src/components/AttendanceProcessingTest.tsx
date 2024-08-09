import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import axios from 'axios';

interface TestResult {
  userData: any;
  payrollPeriod: {
    start: string;
    end: string;
  };
  processedAttendance: any[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export default function AttendanceProcessingTest() {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const runTest = async (page: number = 1) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post<TestResult>(
        '/api/test-payroll-processing',
        { employeeId, page },
      );
      setResult((prevResult) => ({
        ...response.data,
        processedAttendance: prevResult
          ? [
              ...prevResult.processedAttendance,
              ...response.data.processedAttendance,
            ]
          : response.data.processedAttendance,
      }));
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Error in attendance processing:', err);
      setError(
        err.response?.data?.message ||
          err.message ||
          'An unknown error occurred',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (result && currentPage < result.pagination.totalPages) {
      runTest(currentPage + 1);
    }
  }, [result, currentPage]);

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
        <Button onClick={() => runTest()} disabled={loading}>
          {loading ? 'Processing...' : 'Run Test'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <h2 className="text-lg font-semibold">Error</h2>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">User Data</h2>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.userData, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Payroll Period</h2>
            </CardHeader>
            <CardContent>
              <p>Start: {result.payrollPeriod.start}</p>
              <p>End: {result.payrollPeriod.end}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Processed Attendance</h2>
            </CardHeader>
            <CardContent>
              <p>
                Showing {result.processedAttendance.length} of{' '}
                {result.pagination.totalCount} records
              </p>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.processedAttendance, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {currentPage < result.pagination.totalPages && (
            <Button onClick={() => runTest(currentPage + 1)} disabled={loading}>
              Load More
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
