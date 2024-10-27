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
import { useAdmin } from '@/contexts/AdminContext';

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
  const { user } = useAdmin();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
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

  // Update the handleSubmit function
  const handleSubmit = async (values: any, { setSubmitting }: any) => {
    try {
      const endpoint = selectedEmployee
        ? `/api/admin/employees/${(selectedEmployee as { id: string }).id}`
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
        body: JSON.stringify(values),
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

  // Add proper typing for employee
  const handleEdit = (employee: any) => {
    console.log('Editing employee:', employee);
    setSelectedEmployee({
      ...employee,
      isGovernmentRegistered: employee.isGovernmentRegistered === 'Yes',
    });
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
                  baseSalary: 0,
                  salaryType: 'monthly',
                  bankAccountNumber: '',
                }
              }
              validationSchema={EmployeeSchema}
              onSubmit={handleSubmit}
              enableReinitialize
            >
              {({ isSubmitting, values }) => (
                <Form className="space-y-4">
                  {/* ... existing form fields ... */}

                  {/* Add salary fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
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
                      <Field
                        as="select"
                        name="salaryType"
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select Salary Type</option>
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

                  {/* Add banking information */}
                  <Field
                    name="bankAccountNumber"
                    type="text"
                    placeholder="Bank Account Number"
                    className="w-full p-2 border rounded"
                  />

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting
                      ? 'Saving...'
                      : selectedEmployee
                        ? 'Update Employee'
                        : 'Add Employee'}
                  </Button>
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
