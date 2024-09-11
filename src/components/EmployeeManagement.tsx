// EmployeeManagement.tsx
import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import ImportUserProfilesForm from '../components/ImportUserProfilesForm';  
const EmployeeSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  nickname: Yup.string(),
  department: Yup.string().required('Required'),
  role: Yup.string().required('Required'),
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

const roles = ['DRIVER', 'OPERATION', 'GENERAL', 'ADMIN'];

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  nickname: string;
  department: string;
  role: string;
}

const EmployeeManagement: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [showImportForm, setShowImportForm] = useState(false);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          checkAuthorization(profile.userId);
        } else {
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
      const response = await axios.get('/api/check-authorization', {
        headers: { 'x-line-userid': userId },
      });
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
      const response = await axios.get('/api/employees', {
        headers: { 'x-line-userid': lineUserId },
      });
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleSubmit = async (values: any, { setSubmitting }: any) => {
    try {
      if (selectedEmployee) {
        await axios.put(`/api/employees/${selectedEmployee.id}`, values, {
          headers: { 'x-line-userid': lineUserId },
        });
      } else {
        await axios.post('/api/employees', values, {
          headers: { 'x-line-userid': lineUserId },
        });
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

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold mb-6 text-center">
        Employee Management
      </h2>

      <div className="mb-6 flex justify-between">
        <button
          onClick={() => {
            setIsAddingNew(true);
            setSelectedEmployee(null);
          }}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          Add New Employee
        </button>
        <button
          onClick={() => setShowImportForm(!showImportForm)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          {showImportForm ? 'Hide Import Form' : 'Show Import Form'}
        </button>
      </div>

      {showImportForm && <ImportUserProfilesForm />}

      {(isAddingNew || selectedEmployee) && (
        <Formik
          initialValues={
            selectedEmployee || {
              name: '',
              nickname: '',
              department: '',
              role: '',
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
                name="department"
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
                name="department"
                component="div"
                className="text-red-500 text-sm"
              />

              <Field
                as="select"
                name="role"
                className="w-full p-2 border rounded"
              >
                <option value="">Select Role</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Field>
              <ErrorMessage
                name="role"
                component="div"
                className="text-red-500 text-sm"
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
      )}

      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4">Employee List</h3>
        <table className="w-full border-collapse border">
          <thead>
            <tr className="bg-gray-200">
              <th className="border p-2">Employee ID</th>
              <th className="border p-2">Name</th>
              <th className="border p-2">Nickname</th>
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
                <td className="border p-2">{employee.nickname}</td>
                <td className="border p-2">{employee.department}</td>
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
