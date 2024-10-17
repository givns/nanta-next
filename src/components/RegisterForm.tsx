import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import Image from 'next/image';
import { tr } from 'date-fns/locale';

const ExistingEmployeeSchema = Yup.object().shape({
  employeeId: Yup.string().required('Required'),
});

const RegisterForm: React.FC = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [userInfo, setUserInfo] = useState<any>(null);
  const [shiftDetails, setShiftDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fetchUserAndShiftDetails = async (employeeId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('Fetching user information for employeeId:', employeeId);
      const userResponse = await axios.post('/api/checkExistingEmployee', {
        employeeId,
      });
      console.log('User response:', userResponse.data);

      if (userResponse.data.success) {
        const user = userResponse.data.user;
        setUserInfo(user);
        console.log('User info set:', user);

        if (user.shiftCode) {
          console.log('Fetching shift details for shiftCode:', user.shiftCode);
          const shiftResponse = await axios.get(
            `/api/getShiftDetails?shiftCode=${user.shiftCode}`,
          );
          console.log('Shift response:', shiftResponse.data);
          setShiftDetails(shiftResponse.data);
        } else {
          console.log('No shiftCode found for user');
        }
      } else {
        throw new Error(
          userResponse.data.error || 'Failed to fetch user information',
        );
      }
    } catch (error: any) {
      console.error('Error fetching user or shift details:', error);
      setError(error.message || 'An error occurred while fetching data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExistingEmployeeSubmit = async (
    values: { employeeId: string },
    { setSubmitting }: any,
  ) => {
    await fetchUserAndShiftDetails(values.employeeId);
    setSubmitting(false);
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

  const translateWorkDays = (workDays: number[]): string => {
    if (!workDays || workDays.length === 0) return 'ไม่ระบุ';

    const thaiDays = [
      'อาทิตย์',
      'จันทร์',
      'อังคาร',
      'พุธ',
      'พฤหัสบดี',
      'ศุกร์',
      'เสาร์',
    ];
    const sortedDays = [...workDays].sort((a, b) => a - b);

    if (sortedDays.length === 7) return 'ทุกวัน';

    if (
      sortedDays.length > 2 &&
      (sortedDays.every((day, index) => day === sortedDays[0] + index) ||
        (sortedDays[0] === 0 &&
          sortedDays[sortedDays.length - 1] === 6 &&
          sortedDays.every((day, index) => day === index)))
    ) {
      // Continuous range, including wrap-around from Sunday to Saturday
      return `${thaiDays[sortedDays[0]]} - ${thaiDays[sortedDays[sortedDays.length - 1]]}`;
    }
    console.log(translateWorkDays([0, 1, 2, 3, 4, 5, 6]));

    // Non-continuous or short range
    return sortedDays.map((day) => thaiDays[day]).join(', ');
  };

  const translateEmployeeType = (employeeType: string): string => {
    const translations: { [key: string]: string } = {
      Fulltime: 'พนักงานรายเดือน',
      Parttime: 'พนักงานรายวัน',
      Probation: 'พนักงานทดลองงาน',
    };
    return translations[employeeType] || employeeType;
  };

  if (userInfo) {
    console.log('Rendering user info. ShiftDetails:', shiftDetails);
    return (
      <div className="max-w-md mx-auto mt-10 bg-gray-100 rounded-lg shadow-xl overflow-hidden">
        <div className="bg-white p-6">
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
          <div className="bg-gray-100 rounded-lg mt-6">
            <div className="bg-gray-600 p-2 rounded-t-lg">
              <h3 className="font-bold text-white text-center">
                ข้อมูลพนักงาน
              </h3>
            </div>
            <div className="p-4 space-y-2">
              <p className="flex justify-between">
                <span className="font-semibold">รหัสพนักงาน:</span>
                <span>{userInfo.employeeId}</span>
              </p>
              <p className="flex justify-between">
                <span className="font-semibold">ชื่อ-สกุล:</span>
                <span>{userInfo.name}</span>
              </p>
              <p className="flex justify-between">
                <span className="font-semibold">แผนก:</span>
                <span>{userInfo.departmentName}</span>
              </p>
              <p className="flex justify-between">
                <span className="font-semibold">ประเภทพนักงาน:</span>
                <span>{translateEmployeeType(userInfo.employeeType)}</span>
              </p>
              {shiftDetails ? (
                <>
                  <p className="flex justify-between">
                    <span className="font-semibold">กะการทำงาน:</span>
                    <span>{shiftDetails.name}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-semibold">เวลาทำงาน:</span>
                    <span>
                      {shiftDetails.startTime} - {shiftDetails.endTime}
                    </span>
                  </p>
                  <p className="flex justify-between">
                    <span className="font-semibold">วันทำงาน:</span>
                    <span>{translateWorkDays(shiftDetails.workDays)}</span>
                  </p>
                </>
              ) : (
                <p>ไม่พบข้อมูลกะการทำงาน</p>
              )}
            </div>
          </div>
          <div className="bg-gray-100 rounded-lg mt-6">
            <div className="bg-gray-600 p-2 rounded-t-lg">
              <h3 className="font-bold text-white text-center">วันลาคงเหลือ</h3>
            </div>
            <div className="p-4 space-y-2">
              <p className="flex justify-between">
                <span className="font-semibold">วันลาป่วยคงเหลือ:</span>
                <span>{userInfo.sickLeaveBalance} วัน</span>
              </p>
              <p className="flex justify-between">
                <span className="font-semibold">วันลากิจคงเหลือ:</span>
                <span>{userInfo.businessLeaveBalance} วัน</span>
              </p>
              <p className="flex justify-between">
                <span className="font-semibold">วันลาพักร้อนคงเหลือ:</span>
                <span>{userInfo.annualLeaveBalance} วัน</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleConfirmRegistration}
            className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 mt-6"
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
