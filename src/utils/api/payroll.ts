// utils/api/payroll.ts
import { PayrollCalculationResult, PayrollApiResponse } from '@/types/payroll';

export async function calculatePayroll(params: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  lineUserId: string;
}): Promise<PayrollCalculationResult> {
  const response = await fetch('/api/admin/payroll/calculate-payroll', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-line-userid': params.lineUserId,
    },
    body: JSON.stringify(params),
  });

  const result: PayrollApiResponse<PayrollCalculationResult> =
    await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function savePayroll(params: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  payrollData: PayrollCalculationResult;
  lineUserId: string;
}): Promise<PayrollCalculationResult> {
  const response = await fetch('/api/admin/payroll/payroll', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-line-userid': params.lineUserId,
    },
    body: JSON.stringify(params),
  });

  const result: PayrollApiResponse<PayrollCalculationResult> =
    await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function getPayroll(params: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  lineUserId: string;
}): Promise<PayrollCalculationResult | null> {
  const response = await fetch(
    `/api/admin/payroll/payroll?employeeId=${params.employeeId}&periodStart=${params.periodStart}&periodEnd=${params.periodEnd}`,
    {
      headers: {
        'x-line-userid': params.lineUserId,
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  const result: PayrollApiResponse<PayrollCalculationResult> =
    await response.json();

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}
