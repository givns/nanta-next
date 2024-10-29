// types/employee.ts

export type UserRole =
  | 'Employee'
  | 'Admin'
  | 'SuperAdmin'
  | 'Manager'
  | 'Operation'
  | 'Driver';
export type EmployeeType = 'Probation' | 'Fulltime' | 'Parttime';
export type SalaryType = 'monthly' | 'daily';

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  nickname: string | null;
  departmentName: string;
  role: UserRole;
  employeeType: EmployeeType;
  company: string | null;
  isGovernmentRegistered: 'Yes' | 'No';
  shiftCode: string | null;
  baseSalary: number | null;
  salaryType: 'monthly' | 'daily' | null;
  bankAccountNumber: string | null;
  workStartDate: Date | null;
  sickLeaveBalance: number;
  businessLeaveBalance: number;
  annualLeaveBalance: number;
  profilePictureUrl: string | null;
}

export interface EmployeeFormData {
  name: string;
  nickname?: string;
  departmentName: string;
  role: UserRole;
  employeeType: EmployeeType;
  isGovernmentRegistered: boolean;
  company?: string;
  shiftCode?: string;
  baseSalary?: number;
  salaryType?: 'monthly' | 'daily';
  bankAccountNumber?: string;
  workStartDate: Date;
  sickLeaveBalance: number;
  businessLeaveBalance: number;
  annualLeaveBalance: number;
}

export interface DepartmentInfo {
  id: string;
  name: string;
  employeeCount: number;
}

export interface ShiftInfo {
  id: string;
  name: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}
