// components/payroll/PayrollContainer.tsx
import React, { useState, useEffect } from 'react';
import { PayrollDisplay } from './PayrollDisplay';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import type { PayrollSummaryResponse } from '@/types/api';

interface PayrollContainerProps {
  employeeId: string;
}

export const PayrollContainer: React.FC<PayrollContainerProps> = ({
  employeeId,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [payrollData, setPayrollData] = useState<PayrollSummaryResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPayrollData();
  }, [selectedPeriod]);

  const fetchPayrollData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/payroll/summary?employeeId=${employeeId}${selectedPeriod ? `&date=${selectedPeriod}` : ''}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch payroll data');
      }

      const data = await response.json();
      setPayrollData(data);
    } catch (error) {
      setError('Failed to load payroll data');
      console.error('Payroll fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Loading payroll data...</div>;
  }

  if (error) {
    return <Alert variant="destructive">{error}</Alert>;
  }

  if (!payrollData) {
    return <Alert>No payroll data available</Alert>;
  }

  return (
    <div className="space-y-6">
      <PayrollDisplay data={payrollData} />
    </div>
  );
};
