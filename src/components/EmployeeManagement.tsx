import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import api from '../utils/api';

const EmployeeSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  nickname: Yup.string(),
  departmentName: Yup.string().required('Required'),
  role: Yup.string().required('Required'),
  employeeType: Yup.string().required('Required'),
  isGovernmentRegistered: Yup.boolean(),
  company: Yup.string(),
  shiftCode: Yup.string(),
});

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  nickname: string | null;
  departmentName: string;
  role: string;
  assignedShift: { id: string; name: string } | null;
  employeeType: string;
  isGovernmentRegistered: string;
  company: string | null;
  profilePictureUrl: string | null;
  isRegistrationComplete: string;
  isPreImported: string;
  shiftCode: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
//update the departments array with the following values
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

const EmployeeManagement: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          console.log('LINE profile:', profile);
          setLineUserId(profile.userId);
          localStorage.setItem('lineUserId', profile.userId); // Store lineUserId in localStorage
          checkAuthorization(profile.userId);
        } else {
          console.log('User not logged in');
          liff.login();
        }
      } catch (error) {
        console.error('LIFF initialization failed', error);
      }
    };

    initializeLiff();
  }, []);

  const checkAuthorization = async (userId: string) => {
    try {
      const response = await api.get('/check-authorization');
      setIsAuthorized(response.data.isAuthorized);
      if (response.data.isAuthorized) {
        fetchEmployees();
      }
    } catch (error) {
      console.error('Error checking authorization:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      console.log('Fetching employees');
      const response = await api.get('/employees');
      console.log('Fetched employees:', response.data);
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
        console.error('Response headers:', error.response?.headers);
      }
    }
  };

  const handleSubmit = async (values: any, { setSubmitting }: any) => {
    try {
      if (selectedEmployee) {
        await api.put(`/employees/${selectedEmployee.id}`, values);
      } else {
        await api.post('/employees', values);
      }
      fetchEmployees();
      setSelectedEmployee(null);
      setIsAddingNew(false);
    } catch (error) {
      console.error('Error submitting employee data:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthorized) {
    return <div>You are not authorized to access this page.</div>;
  }

  const renderEmployeeForm = () => (
    <Formik
      initialValues={
        selectedEmployee || {
          name: '',
          nickname: '',
          departmentId: '',
          role: '',
          employeeType: 'PROBATION',
          isGovernmentRegistered: false,
          company: '',
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

          <Field as="select" name="role" className="w-full p-2 border rounded">
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

          <label className="flex items-center">
            <Field
              type="checkbox"
              name="isGovernmentRegistered"
              className="mr-2"
            />
            Is Government Registered
          </label>

          <Field
            name="company"
            type="text"
            placeholder="Company"
            className="w-full p-2 border rounded"
          />

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
  );

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold mb-6 text-center">
        Employee Management
      </h2>

      <button
        onClick={() => {
          setIsAddingNew(true);
          setSelectedEmployee(null);
        }}
        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 mb-4"
      >
        Add New Employee
      </button>

      {(isAddingNew || selectedEmployee) && renderEmployeeForm()}

      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4">Employee List</h3>
        <table className="w-full border-collapse border">
          <thead>
            <tr className="bg-gray-200">
              <th className="border p-2">Employee ID</th>
              <th className="border p-2">Name</th>
              <th className="border p-2">Department</th>
              <th className="border p-2">Role</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="border p-2">{employee.employeeId}</td>
                <td className="border p-2">{employee.name}</td>
                <td className="border p-2">
                  {employee.departmentName || 'Unassigned'}
                </td>
                <td className="border p-2">{employee.role}</td>
                <td className="border p-2">
                  <button
                    onClick={() => setSelectedEmployee(employee)}
                    className="bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600 mr-2"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmployeeManagement;
