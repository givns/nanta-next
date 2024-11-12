//RegisterForm.tsx
import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { User } from '@/types/user';
import { ShiftData } from '@/types/attendance';
import { useRouter } from 'next/router';
import { authCache } from '@/hooks/useAuth';

const ExistingEmployeeSchema = Yup.object().shape({
  employeeId: Yup.string().required('กรุณากรอกรหัสพนักงาน'),
});

const RegisterForm: React.FC = () => {
  const router = useRouter();
  const { lineUserId } = useLiff();
  const { registrationStatus } = useAuth({ allowRegistration: true });

  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [shiftDetails, setShiftDetails] = useState<ShiftData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState(false);

  // Check if user already has ongoing registration
  useEffect(() => {
    if (registrationStatus?.employeeId) {
      fetchUserAndShiftDetails(registrationStatus.employeeId);
    }
  }, [registrationStatus]);

  const fetchUserAndShiftDetails = async (employeeId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch user data
      const userResponse = await fetch('/api/checkExistingEmployee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId || '',
        },
        body: JSON.stringify({ employeeId }),
      });

      const userData = await userResponse.json();

      if (!userResponse.ok) {
        throw new Error(userData.error || 'Failed to fetch user information');
      }

      setUserInfo(userData.user);

      // Fetch shift details if available
      if (userData.user.shiftCode) {
        const shiftResponse = await fetch(
          `/api/getShiftDetails?shiftCode=${userData.user.shiftCode}`,
        );
        const shiftData = await shiftResponse.json();

        if (shiftResponse.ok) {
          setShiftDetails(shiftData);
        }
      }
    } catch (error) {
      console.error('Error fetching details:', error);
      setError(
        error instanceof Error
          ? error.message
          : 'An error occurred while fetching data',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRegistration = async () => {
    if (!userInfo || !lineUserId) return;

    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId,
        },
        body: JSON.stringify({
          employeeId: userInfo.employeeId,
          profilePictureUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      const result = await response.json();

      // Verify the registration was successful
      if (!result.success || result.user?.isRegistrationComplete !== 'Yes') {
        throw new Error('Registration status not updated properly');
      }

      // Show success message
      setConfirmationMessage(true);

      // Close LIFF window after a short delay
      setTimeout(() => {
        liff.closeWindow();
      }, 2000);
    } catch (error) {
      console.error('Registration error:', error);
      setError('การลงทะเบียนล้มเหลว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
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

  // Show error state
  if (error) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <div className="text-red-500 text-center">
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <div className="text-center">กำลังโหลด...</div>
      </div>
    );
  }

  if (confirmationMessage) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <div className="text-center">
          <div className="text-green-500 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            ลงทะเบียนสำเร็จ
          </h2>
          <p className="text-gray-600">
            ระบบกำลังปิดหน้าต่าง กรุณารอสักครู่...
          </p>
        </div>
      </div>
    );
  }

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
    // Show initial registration form
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-6 text-center">
          ลงทะเบียนพนักงาน
        </h2>
        <Formik
          initialValues={{ employeeId: '' }}
          validationSchema={ExistingEmployeeSchema}
          onSubmit={async (values, { setSubmitting }) => {
            await fetchUserAndShiftDetails(values.employeeId);
            setSubmitting(false);
          }}
        >
          {({ isSubmitting }) => (
            <Form className="space-y-4">
              <div>
                <Field
                  name="employeeId"
                  type="text"
                  placeholder="รหัสพนักงาน"
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
