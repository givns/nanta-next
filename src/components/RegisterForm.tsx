import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';

const ExistingEmployeeSchema = Yup.object().shape({
  employeeId: Yup.string().required('Required'),
});

const NewEmployeeSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  nickname: Yup.string(),
  department: Yup.string().required('Required'),
  role: Yup.string().required('Required'),
  general: Yup.string(), // This is a placeholder for general error message
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

const RegisterForm: React.FC = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          setProfilePictureUrl(profile.pictureUrl || '');
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('LIFF initialization failed', error);
      }
    };

    initializeLiff();
  }, []);

  const handleExistingEmployeeSubmit = async (
    values: any,
    { setSubmitting, setFieldError }: any,
  ) => {
    try {
      const response = await axios.post('/api/checkExistingEmployee', {
        employeeId: values.employeeId,
        lineUserId,
        profilePictureUrl,
      });

      if (response.data.success) {
        setUserInfo(response.data.user);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.error('Error checking existing employee:', error);
      setFieldError('employeeId', 'Employee ID not found or error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRegistration = async () => {
    try {
      const response = await axios.post('/api/confirmRegistration', {
        employeeId: userInfo.employeeId,
        lineUserId,
        profilePictureUrl,
      });

      if (response.data.success) {
        alert(
          'Registration successful! Please check your LINE app for further instructions.',
        );
        liff.closeWindow();
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.error('Error confirming registration:', error);
      alert('Error occurred during registration confirmation');
    }
  };

  if (userInfo) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-6 text-center">
          Confirm Your Information
        </h2>
        <div className="space-y-4">
          <p>
            <strong>Employee ID:</strong> {userInfo.employeeId}
          </p>
          <p>
            <strong>Name:</strong> {userInfo.name}
          </p>
          <p>
            <strong>Nickname:</strong> {userInfo.nickname}
          </p>
          <p>
            <strong>Department:</strong> {userInfo.department}
          </p>
          <p>
            <strong>Role:</strong> {userInfo.role}
          </p>
          <p>
            <strong>Sick Leave Balance:</strong> {userInfo.sickLeaveBalance}
          </p>
          <p>
            <strong>Business Leave Balance:</strong>{' '}
            {userInfo.businessLeaveBalance}
          </p>
          <p>
            <strong>Annual Leave Balance:</strong> {userInfo.annualLeaveBalance}
          </p>
          <button
            onClick={handleConfirmRegistration}
            className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Confirm and Complete Registration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold mb-6 text-center">
        Existing Employee Registration
      </h2>
      <Formik
        initialValues={{ employeeId: '' }}
        validationSchema={ExistingEmployeeSchema}
        onSubmit={handleExistingEmployeeSubmit}
      >
        {({ isSubmitting }) => (
          <Form className="space-y-4">
            <div>
              <Field
                name="employeeId"
                type="text"
                placeholder="Employee ID"
                className="w-full p-2 border rounded"
              />
              <ErrorMessage
                name="employeeId"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
            >
              {isSubmitting ? 'Checking...' : 'Check Employee ID'}
            </button>
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default RegisterForm;
