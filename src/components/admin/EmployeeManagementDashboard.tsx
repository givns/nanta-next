// components/admin/EmployeeManagementDashboard.tsx
import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';

// Define interfaces for employee data
interface Employee {
  id: string;
  employeeId: string;
  name: string;
  nickname?: string | null;
  departmentName: string;
  role: string;
  employeeType: 'Probation' | 'Fulltime' | 'Parttime';
  isGovernmentRegistered: string;
  company?: string | null;
  shiftCode?: string | null;
  baseSalary?: number | null;
  salaryType?: 'monthly' | 'daily' | null;
  bankAccountNumber?: string | null;
  sickLeaveBalance: number;
  busiLeaveBalance: number;
  annualLeaveBalance: number;
}

interface EmployeeFormData {
  name: string;
  nickname: string;
  departmentName: string;
  role: string;
  employeeType: 'Probation' | 'Fulltime' | 'Parttime';
  isGovernmentRegistered: boolean;
  company: string;
  shiftCode: string;
  baseSalary: number;
  salaryType: 'monthly' | 'daily';
  bankAccountNumber: string;
  sickLeaveBalance: number;
  busiLeaveBalance: number;
  annualLeaveBalance: number;
}

const EmployeeSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  nickname: Yup.string(),
  departmentName: Yup.string().required('Required'),
  role: Yup.string().required('Required'),
  employeeType: Yup.string()
    .oneOf(['Probation', 'Fulltime', 'Parttime'])
    .required('Required'),
  isGovernmentRegistered: Yup.boolean(),
  company: Yup.string(),
  shiftCode: Yup.string(),
  baseSalary: Yup.number().nullable(),
  salaryType: Yup.string().oneOf(['monthly', 'daily']).nullable(),
  bankAccountNumber: Yup.string().nullable(),
  sickLeaveBalance: Yup.number().nullable(),
  busiLeaveBalance: Yup.number().nullable(),
  annualLeaveBalance: Yup.number().nullable(),
});

const departments = [
  'ฝ่ายปฏิบัติการ',
  'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)',
  'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)',
  'ฝ่ายผลิต-คัดคุณภาพและบรรจุ',
  'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง',
  'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์',
  'ฝ่ายประกันคุณภาพ',
  'ฝ่ายคลังสินค้าและแพ็คกิ้ง',
  'ฝ่ายจัดส่งสินค้า',
  'ฝ่ายบริหารงานขาย',
  'ฝ่ายจัดซื้อและประสานงาน',
  'ฝ่ายบัญชีและการเงิน',
  'ฝ่ายทรัพยากรบุคคล',
  'ฝ่ายรักษาความสะอาด',
  'ฝ่ายรักษาความปลอดภัย',
];

export default function EmployeeManagementDashboard() {
  const { user } = useAdmin();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] =
    useState<EmployeeFormData | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch employees with lineUserId in headers
  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/admin/employees', {
        headers: {
          'x-line-userid': user?.lineUserId || '',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch employees');
      }
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setError('Failed to load employees');
    }
  };

  const defaultEmployeeValues: EmployeeFormData = {
    name: '',
    nickname: '',
    departmentName: '',
    role: '',
    employeeType: 'Probation', // Changed from 'PROBATION' to match the type
    isGovernmentRegistered: false,
    company: '',
    shiftCode: '',
    baseSalary: 0,
    salaryType: 'monthly',
    bankAccountNumber: '',
    sickLeaveBalance: 30,
    busiLeaveBalance: 3,
    annualLeaveBalance: 3,
  };
  // Convert API employee data to form data structure
  const mapEmployeeToFormData = (employee: Employee): EmployeeFormData => {
    return {
      name: employee.name,
      nickname: employee.nickname || '',
      departmentName: employee.departmentName,
      role: employee.role,
      employeeType: employee.employeeType,
      isGovernmentRegistered: employee.isGovernmentRegistered === 'Yes',
      company: employee.company || '',
      shiftCode: employee.shiftCode || '',
      baseSalary: employee.baseSalary || 0,
      salaryType: employee.salaryType || 'monthly',
      bankAccountNumber: employee.bankAccountNumber || '',
      sickLeaveBalance: employee.sickLeaveBalance,
      busiLeaveBalance: employee.busiLeaveBalance,
      annualLeaveBalance: employee.annualLeaveBalance,
    };
  };

  const handleSubmit = async (
    values: EmployeeFormData,
    { setSubmitting }: any,
  ) => {
    try {
      const endpoint = selectedEmployee
        ? `/api/admin/employees/${employees.find((e) => e.name === selectedEmployee.name)?.id}`
        : '/api/admin/employees';

      const method = selectedEmployee ? 'PUT' : 'POST';

      console.log('Submitting to:', endpoint, 'with method:', method);
      console.log('Values:', values);

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          ...values,
          isGovernmentRegistered: values.isGovernmentRegistered ? 'Yes' : 'No',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save employee');
      }

      await fetchEmployees();
      setSelectedEmployee(null);
      setIsAddingNew(false);
      setError(null);
    } catch (error) {
      console.error('Error saving employee:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to save employee',
      );
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (user?.lineUserId) {
      fetchEmployees();
    }
  }, [user]);

  const handleEdit = (employee: Employee) => {
    console.log('Editing employee:', employee);
    const formData = mapEmployeeToFormData(employee);
    setSelectedEmployee(formData);
    setIsAddingNew(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Employee Management</h1>
        <Button
          onClick={() => {
            setIsAddingNew(true);
            setSelectedEmployee(null);
          }}
        >
          Add New Employee
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(isAddingNew || selectedEmployee) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedEmployee ? 'Edit Employee' : 'Add New Employee'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Formik
              initialValues={selectedEmployee || defaultEmployeeValues}
              validationSchema={EmployeeSchema}
              onSubmit={handleSubmit}
              enableReinitialize
            >
              {({ isSubmitting, values }) => (
                <Form className="space-y-6">
                  {/* Basic Information Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Basic Information</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Full Name
                        </label>
                        <Field
                          name="name"
                          type="text"
                          placeholder="Full Name"
                          className="w-full p-2 border rounded"
                        />
                        <ErrorMessage
                          name="name"
                          component="div"
                          className="text-red-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nickname
                        </label>
                        <Field
                          name="nickname"
                          type="text"
                          placeholder="Nickname"
                          className="w-full p-2 border rounded"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Department
                        </label>
                        <Field
                          as="select"
                          name="departmentName"
                          className="w-full p-2 border rounded"
                        >
                          <option value="">Select Department</option>
                          {departments.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </Field>
                        <ErrorMessage
                          name="departmentName"
                          component="div"
                          className="text-red-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Role
                        </label>
                        <Field
                          as="select"
                          name="role"
                          className="w-full p-2 border rounded"
                        >
                          <option value="">Select Role</option>
                          <option value="Employee">Employee</option>
                          <option value="Manager">Manager</option>
                          <option value="Admin">Admin</option>
                          <option value="SuperAdmin">Super Admin</option>
                        </Field>
                        <ErrorMessage
                          name="role"
                          component="div"
                          className="text-red-500 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Employee Type
                        </label>
                        <Field
                          as="select"
                          name="employeeType"
                          className="w-full p-2 border rounded"
                        >
                          <option value="Probation">Probation</option>
                          <option value="Fulltime">Full Time</option>
                          <option value="Parttime">Part Time</option>
                        </Field>
                        <ErrorMessage
                          name="employeeType"
                          component="div"
                          className="text-red-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Shift Code
                        </label>
                        <Field
                          name="shiftCode"
                          type="text"
                          placeholder="Shift Code"
                          className="w-full p-2 border rounded"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Employment Details Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Employment Details
                    </h3>
                    <div className="flex items-center space-x-2">
                      <Field
                        type="checkbox"
                        name="isGovernmentRegistered"
                        className="rounded"
                      />
                      <label className="text-sm font-medium text-gray-700">
                        Government Registered
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company
                      </label>
                      <Field
                        name="company"
                        type="text"
                        placeholder="Company"
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>

                  {/* Salary Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Salary Information
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Base Salary
                        </label>
                        <Field
                          name="baseSalary"
                          type="number"
                          placeholder="Base Salary"
                          className="w-full p-2 border rounded"
                        />
                        <ErrorMessage
                          name="baseSalary"
                          component="div"
                          className="text-red-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Salary Type
                        </label>
                        <Field
                          as="select"
                          name="salaryType"
                          className="w-full p-2 border rounded"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="daily">Daily</option>
                        </Field>
                        <ErrorMessage
                          name="salaryType"
                          component="div"
                          className="text-red-500 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bank Account Number
                      </label>
                      <Field
                        name="bankAccountNumber"
                        type="text"
                        placeholder="Bank Account Number"
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>

                  {/* Leave Balance Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Leave Balance</h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sick Leave Balance
                        </label>
                        <Field
                          name="sickLeaveBalance"
                          type="number"
                          className="w-full p-2 border rounded"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Business Leave Balance
                        </label>
                        <Field
                          name="busiLeaveBalance"
                          type="number"
                          className="w-full p-2 border rounded"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Annual Leave Balance
                        </label>
                        <Field
                          name="annualLeaveBalance"
                          type="number"
                          className="w-full p-2 border rounded"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isSubmitting
                        ? 'Saving...'
                        : selectedEmployee
                          ? 'Update Employee'
                          : 'Add Employee'}
                    </Button>
                  </div>
                </Form>
              )}
            </Formik>
          </CardContent>
        </Card>
      )}

      {/* Employee List */}
      <Card>
        <CardHeader>
          <CardTitle>Employee List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee: any) => (
                <TableRow key={employee.id}>
                  <TableCell>{employee.employeeId}</TableCell>
                  <TableCell>{employee.name}</TableCell>
                  <TableCell>
                    {employee.departmentName || 'Unassigned'}
                  </TableCell>
                  <TableCell>{employee.role}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(employee)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
