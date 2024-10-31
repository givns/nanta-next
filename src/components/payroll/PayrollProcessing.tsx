import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PayrollPeriodSelector } from './PayrollPeriodSelector';
import { PayrollProcessingResult, PayrollStatus } from '@/types/payroll';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface ProcessingStatus {
  totalEmployees: number;
  processedCount: number;
  status: 'idle' | 'processing' | 'completed' | 'error';
  error?: string;
}

export const PayrollProcessing: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    totalEmployees: 0,
    processedCount: 0,
    status: 'idle',
  });
  const [results, setResults] = useState<PayrollProcessingResult[]>([]);

  const startProcessing = async () => {
    if (!selectedPeriod) return;

    setProcessingStatus((prev) => ({ ...prev, status: 'processing' }));

    try {
      // Start processing
      const response = await fetch('/api/admin/payroll/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodYearMonth: selectedPeriod }),
      });

      if (!response.ok) throw new Error('Failed to start processing');

      // Set up SSE for progress updates
      const eventSource = new EventSource(
        `/api/admin/payroll/process-status?period=${selectedPeriod}`,
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProcessingStatus(data);

        if (data.results) {
          setResults(data.results);
        }

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
    } catch (error) {
      setProcessingStatus((prev) => ({
        ...prev,
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to process payroll',
      }));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payroll Processing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Period Selection */}
            <div className="flex space-x-4">
              <PayrollPeriodSelector
                currentValue={selectedPeriod}
                onChange={setSelectedPeriod}
                disabled={processingStatus.status === 'processing'}
              />

              <Button
                onClick={startProcessing}
                disabled={
                  !selectedPeriod || processingStatus.status === 'processing'
                }
              >
                {processingStatus.status === 'processing' ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Process Payroll'
                )}
              </Button>
            </div>

            {/* Processing Status */}
            {processingStatus.status !== 'idle' && (
              <div className="space-y-4">
                <Progress
                  value={
                    (processingStatus.processedCount /
                      processingStatus.totalEmployees) *
                    100
                  }
                  className="h-2"
                />

                <div className="text-sm text-muted-foreground">
                  Processed {processingStatus.processedCount} of{' '}
                  {processingStatus.totalEmployees} employees
                </div>

                {/* Results Summary */}
                {results.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Processing Results</h4>
                    <div className="grid gap-2">
                      {results.map((result, index) => (
                        <div
                          key={result.employee.id}
                          className="flex justify-between items-center p-2 bg-muted rounded-md"
                        >
                          <div>
                            <p className="font-medium">
                              {result.employee.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {result.employee.departmentName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">
                              ฿
                              {result.processedData.netPayable.toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Net Payable
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status Alerts */}
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PayrollProcessing;
