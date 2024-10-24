// components/payroll/PayrollProcessing.tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PayrollPeriod, ProcessingStatus } from '@/types/payroll';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function PayrollProcessing() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    totalEmployees: 0,
    processedCount: 0,
    status: 'idle',
  });

  useEffect(() => {
    fetchPayrollPeriods();
  }, []);

  const fetchPayrollPeriods = async () => {
    try {
      const response = await fetch('/api/payroll/periods');
      if (response.ok) {
        const data = await response.json();
        setPeriods(data);
      }
    } catch (error) {
      console.error('Error fetching payroll periods:', error);
    }
  };

  const startProcessing = async () => {
    if (!selectedPeriodId) return;

    setProcessingStatus((prev) => ({ ...prev, status: 'processing' }));

    try {
      const response = await fetch(`/api/payroll/process/${selectedPeriodId}`, {
        method: 'POST',
      });

      if (response.ok) {
        // Set up SSE for progress updates
        const eventSource = new EventSource(
          `/api/payroll/process-status/${selectedPeriodId}`,
        );

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          setProcessingStatus(data);

          if (data.status === 'completed' || data.status === 'error') {
            eventSource.close();
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          setProcessingStatus((prev) => ({
            ...prev,
            status: 'error',
            error: 'Lost connection to server',
          }));
        };
      }
    } catch (error) {
      console.error('Error processing payroll:', error);
      setProcessingStatus((prev) => ({
        ...prev,
        status: 'error',
        error: 'Failed to start processing',
      }));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Process Payroll</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-4">
            <Select
              value={selectedPeriodId}
              onValueChange={setSelectedPeriodId}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select payroll period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {format(new Date(period.startDate), 'MMM dd')} -{' '}
                    {format(new Date(period.endDate), 'MMM dd, yyyy')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={startProcessing}
              disabled={
                !selectedPeriodId || processingStatus.status === 'processing'
              }
            >
              {processingStatus.status === 'processing'
                ? 'Processing...'
                : 'Start Processing'}
            </Button>
          </div>

          {processingStatus.status !== 'idle' && (
            <div className="space-y-4">
              <Progress
                value={
                  (processingStatus.processedCount /
                    processingStatus.totalEmployees) *
                  100
                }
              />
              <div className="text-sm text-gray-500">
                Processed {processingStatus.processedCount} of{' '}
                {processingStatus.totalEmployees} employees
              </div>

              {processingStatus.status === 'completed' && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Payroll processing completed successfully
                  </AlertDescription>
                </Alert>
              )}

              {processingStatus.status === 'error' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {processingStatus.error ||
                      'An error occurred during processing'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
