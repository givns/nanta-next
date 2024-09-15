import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import Image from 'next/image';

const ExistingEmployeeSchema = Yup.object().shape({
  employeeId: Yup.string().required('Required'),
});

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
      });

      if (response.data.success) {
        setUserInfo(response.data.user);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.error('Error checking existing employee:', error);
      if (error.response && error.response.status === 404) {
        setFieldError('employeeId', 'Employee ID not found');
      } else {
        setFieldError(
          'employeeId',
          'Error occurred while checking employee ID',
        );
      }
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
          กรุณาตรวจสอบข้อมูลของคุณ
        </h2>
        <div className="flex flex-col items-center mb-6">
          <div className="w-32 h-32 rounded-full overflow-hidden mb-4">
            <Image
              src={profilePictureUrl || '/default-avatar.png'}
              alt="Profile"
              width={128}
              height={128}
              className="object-cover"
            />
          </div>
        </div>
        <div className="space-y-4">
          <p>
            <strong>รหัสพนักงาน:</strong> {userInfo.employeeId}
          </p>
          <p>
            <strong>ชื่อ-สกุล:</strong> {userInfo.name}
          </p>
          <p>
            <strong>แผนก:</strong> {userInfo.departmentName}
          </p>
          <p>
            <strong>ประเภทพนักงาน:</strong> {userInfo.employeeType}
          </p>
          <p>
            <strong>รหัสกะการทำงาน:</strong> {userInfo.shiftCode}
          </p>
          <div className="bg-gray-100 p-4 rounded-lg">
            <h3 className="font-bold mb-2">วันลาคงเหลือ</h3>
            <p>
              <strong>วันลาป่วยคงเหลือ:</strong> {userInfo.sickLeaveBalance}{' '}
              days
            </p>
            <p>
              <strong>วันลากิจคงเหลือ:</strong> {userInfo.businessLeaveBalance}{' '}
              days
            </p>
            <p>
              <strong>วันลาพักร้อนคงเหลือ:</strong>{' '}
              {userInfo.annualLeaveBalance} days
            </p>
          </div>

          <button
            onClick={handleConfirmRegistration}
            className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            ยืนยันข้อมูล
          </button>
        </div>
      </div>
    );
  } else {
    // When userInfo is not available
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-6 text-center">
          ลงทะเบียนพนักงาน
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
                {isSubmitting ? 'กำลังตรวจสอบ...' : 'ค้นหาข้อมูลพนักงาน'}
              </button>
            </Form>
          )}
        </Formik>
      </div>
    );
  }
};

export default RegisterForm;
