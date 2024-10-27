// components/admin/EmployeeManagementDashboard.tsx
import { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { employeeSchema } from '@/schemas/employee';

const EmployeeSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  nickname: Yup.string(),
  departmentName: Yup.string().required('Required'),
  role: Yup.string().required('Required'),
  employeeType: Yup.string().required('Required'),
  isGovernmentRegistered: Yup.boolean(),
  company: Yup.string(),
  shiftCode: Yup.string(),
  baseSalary: Yup.number().nullable(),
  salaryType: Yup.string().nullable(),
  bankAccountNumber: Yup.string().nullable(),
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
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/admin/employees');
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

  const handleSubmit = async (values: any, { setSubmitting }: any) => {
    try {
      const endpoint = selectedEmployee
        ? `/api/admin/employees/${(selectedEmployee as any).id}`
        : '/api/admin/employees';

      const method = selectedEmployee ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to save employee');
      }

      await fetchEmployees();
      setSelectedEmployee(null);
      setIsAddingNew(false);
    } catch (error) {
      console.error('Error saving employee:', error);
      setError('Failed to save employee');
    } finally {
      setSubmitting(false);
    }
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
              initialValues={
                selectedEmployee || {
                  name: '',
                  nickname: '',
                  departmentName: '',
                  role: '',
                  employeeType: 'PROBATION',
                  isGovernmentRegistered: false,
                  company: '',
                  shiftCode: '',
                }
              }
              validationSchema={EmployeeSchema}
              onSubmit={handleSubmit}
            >
              {({ isSubmitting }) => (
                <Form className="space-y-4 mb-8">
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

                  <Field
                    name="nickname"
                    type="text"
                    placeholder="Nickname"
                    className="w-full p-2 border rounded"
                  />

                  <Field
                    as="select"
                    name="departmentName"
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept, index) => (
                      <option key={index} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </Field>
                  <ErrorMessage
                    name="departmentName"
                    component="div"
                    className="text-red-500 text-sm"
                  />

                  <Field
                    name="shiftCode"
                    type="text"
                    placeholder="Shift Code"
                    className="w-full p-2 border rounded"
                  />

                  <Field
                    as="select"
                    name="role"
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select Role</option>
                    <option value="DRIVER">Driver</option>
                    <option value="OPERATION">Operation</option>
                    <option value="GENERAL">General</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPERADMIN">Super Admin</option>
                  </Field>
                  <ErrorMessage
                    name="role"
                    component="div"
                    className="text-red-500 text-sm"
                  />

                  <Field
                    as="select"
                    name="employeeType"
                    className="w-full p-2 border rounded"
                  >
                    <option value="FULL_TIME">Full Time</option>
                    <option value="PART_TIME">Part Time</option>
                    <option value="PROBATION">Probation</option>
                  </Field>
                  <ErrorMessage
                    name="employeeType"
                    component="div"
                    className="text-red-500 text-sm"
                  />
                  <Field
                    name="company"
                    type="text"
                    placeholder="Company"
                    className="w-full p-2 border rounded"
                  />
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Salary Information</h3>
                    <Field
                      name="baseSalary"
                      type="number"
                      placeholder="Base Salary"
                      className="w-full p-2 border rounded"
                    />

                    <Field
                      as="select"
                      name="salaryType"
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select Salary Type</option>
                      <option value="monthly">Monthly</option>
                      <option value="daily">Daily</option>
                    </Field>

                    <Field
                      name="bankAccountNumber"
                      type="text"
                      placeholder="Bank Account Number"
                      className="w-full p-2 border rounded"
                    />
                  </div>

                  {/* Additional Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">
                      Additional Information
                    </h3>
                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <Field
                          type="radio"
                          name="isGovernmentRegistered"
                          value="Yes"
                          className="mr-2"
                        />
                        Government Registered
                      </label>
                      <label className="flex items-center">
                        <Field
                          type="radio"
                          name="isGovernmentRegistered"
                          value="No"
                          className="mr-2"
                        />
                        Not Registered
                      </label>
                    </div>

                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <Field
                          type="radio"
                          name="isRegistrationComplete"
                          value="Yes"
                          className="mr-2"
                        />
                        Registration Complete
                      </label>
                      <label className="flex items-center">
                        <Field
                          type="radio"
                          name="isRegistrationComplete"
                          value="No"
                          className="mr-2"
                        />
                        Registration Incomplete
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
                  >
                    {isSubmitting
                      ? 'Submitting...'
                      : selectedEmployee
                        ? 'Update Employee'
                        : 'Add Employee'}
                  </button>
                </Form>
              )}
            </Formik>
          </CardContent>
        </Card>
      )}

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
                      onClick={() => setSelectedEmployee(employee)}
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
