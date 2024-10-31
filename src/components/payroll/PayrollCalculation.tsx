import React, { useState } from 'react';
import { PayrollCalculationResult } from '@/types/payroll';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { AlertCircle, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PayrollCalculationProps {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  onCalculationComplete?: (result: PayrollCalculationResult) => void;
}

export const PayrollCalculation: React.FC<PayrollCalculationProps> = ({
  employeeId,
  periodStart,
  periodEnd,
  onCalculationComplete,
}) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<PayrollCalculationResult | null>(null);
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

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && (
              <div className="space-y-6">
                {/* Employee Info */}
                <div className="grid grid-cols-2 gap-4 bg-muted/50 p-4 rounded-lg">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">
                      Employee
                    </h4>
                    <p className="mt-1">{result.employee.name}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">
                      Department
                    </h4>
                    <p className="mt-1">{result.employee.departmentName}</p>
                  </div>
                </div>

                {/* Hours Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium">Regular Hours</h4>
                    <p className="text-xl mt-1">
                      {result.hours.regularHours.toFixed(1)}h
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      ฿{result.processedData.basePay.toLocaleString()} base pay
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium">Total Overtime</h4>
                    <p className="text-xl mt-1">
                      {(
                        result.hours.workdayOvertimeHours +
                        result.hours.weekendShiftOvertimeHours +
                        result.hours.holidayOvertimeHours
                      ).toFixed(1)}
                      h
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      ฿{result.processedData.overtimePay.toLocaleString()}{' '}
                      overtime pay
                    </p>
                  </div>
                </div>

                {/* Allowances */}
                <div>
                  <h4 className="font-medium mb-3">Allowances</h4>
                  <div className="space-y-2">
                    {Object.entries(result.processedData.allowances).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between items-center"
                        >
                          <span className="capitalize">{key}</span>
                          <span>฿{value.toLocaleString()}</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                {/* Deductions */}
                <div>
                  <h4 className="font-medium mb-3">Deductions</h4>
                  <div className="space-y-2 text-red-600">
                    {Object.entries(result.processedData.deductions).map(
                      ([key, value]) =>
                        key !== 'total' && (
                          <div
                            key={key}
                            className="flex justify-between items-center"
                          >
                            <span className="capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            <span>-฿{value.toLocaleString()}</span>
                          </div>
                        ),
                    )}
                  </div>
                </div>

                {/* Net Payable */}
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Net Payable</h4>
                    <p className="text-xl font-bold text-green-600">
                      ฿{result.processedData.netPayable.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Success Indicator */}
                <Alert>
                  <Check className="h-4 w-4" />
                  <AlertDescription>
                    Payroll calculation completed successfully
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PayrollCalculation;
