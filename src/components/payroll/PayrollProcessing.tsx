// components/admin/payroll/PayrollProcessing.tsx
import { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { PayrollPeriodSelector } from './PayrollPeriodSelector';
import { AlertCircle } from 'lucide-react';
import { useLiff } from '@/contexts/LiffContext';
import { useAuth } from '@/hooks/useAuth';

interface PayrollProcessingProps {
  onComplete: () => void;
}

export const PayrollProcessing: React.FC<PayrollProcessingProps> = ({
  onComplete,
}) => {
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  const { lineUserId } = useLiff();
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  const startProcessing = async () => {
    if (!selectedPeriod || !lineUserId) return;
    setStatus('processing');
    setError(null);

    try {
      const response = await fetch('/api/admin/payroll/process-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId,
        },
        body: JSON.stringify({ periodYearMonth: selectedPeriod }),
      });

      if (!response.ok) throw new Error('Failed to start processing');

      // Set up progress tracking
      const eventSource = new EventSource(
        `/api/admin/payroll/process-status?period=${selectedPeriod}`,
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress({
          processed: data.processedCount,
          total: data.totalEmployees,
        });

        if (data.status === 'completed') {
          eventSource.close();
          setStatus('completed');
          onComplete();
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setError('Lost connection to server');
        setStatus('idle');
      };
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to process payroll',
      );
      setStatus('idle');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Process Payroll</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <PayrollPeriodSelector
            currentValue={selectedPeriod}
            onChange={setSelectedPeriod}
            disabled={status === 'processing'}
          />

          <Button
            onClick={startProcessing}
            disabled={status === 'processing' || !selectedPeriod}
            className="w-full md:w-auto"
          >
            {status === 'processing' ? 'Processing...' : 'Start Processing'}
          </Button>

          {status === 'processing' && (
            <div className="space-y-2">
              <Progress value={(progress.processed / progress.total) * 100} />
              <p className="text-sm text-gray-500">
                Processed {progress.processed} of {progress.total} employees
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center text-red-600 text-sm">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
