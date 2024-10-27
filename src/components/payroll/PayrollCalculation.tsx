// components/payroll/PayrollCalculation.tsx

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

interface PayrollCalculationProps {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  onCalculationComplete?: (result: any) => void;
}

export const PayrollCalculation: React.FC<PayrollCalculationProps> = ({
  employeeId,
  periodStart,
  periodEnd,
  onCalculationComplete,
}) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const calculatePayroll = async () => {
    setIsCalculating(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/calculate-payroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId,
          periodStart: format(periodStart, 'yyyy-MM-dd'),
          periodEnd: format(periodEnd, 'yyyy-MM-dd'),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to calculate payroll');
      }

      const data = await response.json();
      setResult(data.calculation);
      onCalculationComplete?.(data.calculation);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error calculating payroll',
      );
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payroll Calculation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span>Period:</span>
              <span>
                {format(periodStart, 'dd/MM/yyyy')} -{' '}
                {format(periodEnd, 'dd/MM/yyyy')}
              </span>
            </div>

            <Button
              onClick={calculatePayroll}
              disabled={isCalculating}
              className="w-full"
            >
              {isCalculating ? 'Calculating...' : 'Calculate Payroll'}
            </Button>

            {error && <div className="text-red-500 text-sm">{error}</div>}

            {result && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium">Base Pay</h4>
                    <p>฿{result.actualBasePayAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Overtime</h4>
                    <p>฿{result.overtimeAmount.total.toFixed(2)}</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Allowances</h4>
                    <p>฿{result.allowances.total.toFixed(2)}</p>
                  </div>
                  <div>
                    <h4 className="font-medium">Deductions</h4>
                    <p className="text-red-600">
                      -฿{result.deductions.total.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Net Payable</h4>
                    <p className="text-xl font-bold text-green-600">
                      ฿{result.netPayable.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
