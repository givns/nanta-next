// lib/api.ts
export const fetchPayrollSummary = async (
  employeeId: string,
  period?: string,
) => {
  const response = await fetch(
    `/api/payroll/summary?employeeId=${employeeId}${period ? `&period=${period}` : ''}`,
  );
  if (!response.ok) throw new Error('Failed to fetch payroll summary');
  return response.json();
};

export const fetchPayrollPeriods = async (employeeId: string) => {
  const response = await fetch(`/api/payroll/periods?employeeId=${employeeId}`);
  if (!response.ok) throw new Error('Failed to fetch payroll periods');
  return response.json();
};

export const fetchPayrollSettings = async (employeeId: string) => {
  const response = await fetch(
    `/api/payroll/settings?employeeId=${employeeId}`,
  );
  if (!response.ok) throw new Error('Failed to fetch payroll settings');
  return response.json();
};
