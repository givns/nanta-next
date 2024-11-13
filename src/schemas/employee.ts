// schemas/employee.ts
import { z } from 'zod';

export const employeeSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  nickname: z.string().nullable(),
  departmentName: z.string().min(1, 'Department is required'),
  departmentId: z.string().nullable(),
  role: z.enum(['DRIVER', 'SALES', 'EMPLOYEE', 'ADMIN', 'SUPERADMIN']),
  employeeType: z.enum(['FULL_TIME', 'PART_TIME', 'PROBATION']),
  shiftCode: z.string(),
  company: z.string().default('NT'),
  isGovernmentRegistered: z.enum(['Yes', 'No']).default('No'),
  baseSalary: z.number().nullable(),
  salaryType: z.enum(['monthly', 'daily']).nullable(),
  bankAccountNumber: z.string().nullable(),
  isRegistrationComplete: z.enum(['Yes', 'No']).default('No'),
  isPreImported: z.enum(['Yes', 'No']).default('No'),
});
