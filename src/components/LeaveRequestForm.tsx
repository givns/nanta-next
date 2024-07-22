import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import liff from '@line/liff';
import axios from 'axios';
import { UserData } from '@/types/user';
import { LeaveBalanceData } from '@/types/LeaveService';
import LeaveBalanceComponent from './LeaveBalanceComponent';

export interface FormValues {
  leaveType: string;
  leaveFormat: string;
  reason: string;
  startDate: string;
  endDate: string;
}

interface LeaveRequestFormProps {
  initialData?: FormValues;
  isResubmission?: boolean;
  userData: UserData;
}

const leaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string().required('กรุณาเลือกประเภทการลา'),
  leaveFormat: Yup.string().required('กรุณาเลือกลักษณะการลา'),
  reason: Yup.string().required('กรุณาระบุเหตุผล'),
  startDate: Yup.date().required('กรุณาเลือกวันที่เริ่มลา'),
  endDate: Yup.date().when('leaveFormat', {
    is: 'ลาเต็มวัน',
    then: (schema) => schema.required('กรุณาเลือกวันที่สิ้นสุด'),
  }),
});

const LeaveRequestForm: React.FC<LeaveRequestFormProps> = ({
  initialData,
  isResubmission = false,
}) => {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initializeLiff = useCallback(async () => {
    try {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
        fetchUserData(profile.userId);
      } else {
        liff.login();
      }
    } catch (err) {
      console.error('LIFF initialization failed', err);
      setError('Failed to initialize LIFF');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeLiff();
  }, [initializeLiff]);

  const fetchUserData = async (lineUserId: string) => {
    try {
      const response = await axios.get(`/api/users?lineUserId=${lineUserId}`);
      setUserData(response.data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to fetch user data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBalanceLoaded = (balance: LeaveBalanceData) => {
    setLeaveBalance(balance);
  };

  const calculateLeaveDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // Including both start and end date
  };

  const handleNextStep = () => {
    setStep(step + 1);
  };

  const handlePreviousStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      if (!userData || !userData.id) {
        throw new Error('User data not available');
      }

      const leaveDays = calculateLeaveDays(values.startDate, values.endDate);

      // Check if the user has enough leave balance
      if (leaveBalance) {
        let availableDays: number;
        switch (values.leaveType) {
          case 'ลาป่วย':
            availableDays = leaveBalance.sickLeave;
            break;
          case 'ลากิจ':
            availableDays = leaveBalance.businessLeave;
            break;
          case 'ลาพักร้อน':
            availableDays = leaveBalance.annualLeave;
            break;
          case 'ลาโดยใช้ชั่วโมง OT':
            availableDays = leaveBalance.overtimeLeave;
            break;
          default:
            throw new Error('Invalid leave type');
        }

        if (leaveDays > availableDays) {
          throw new Error(`ไม่มีวันลา${values.leaveType}เพียงพอ`);
        }
      }

      const submissionData = {
        ...values,
        userId: userData.id,
        fullDayCount: leaveDays,
        resubmitted: isResubmission,
      };

      sessionStorage.setItem('leaveSummary', JSON.stringify(submissionData));
      router.push('/leave-summary');
    } catch (error) {
      console.error('Error submitting leave request:', error);
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred',
      );
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userData) {
    return <div>No user data available.</div>;
  }

  return (
    <div className="main-container flex justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-6">
          {isResubmission ? 'แบบฟอร์มขอลางานใหม่' : 'แบบฟอร์มขอลางาน'}
        </h1>

        <LeaveBalanceComponent
          userId={userData.id}
          onBalanceLoaded={handleBalanceLoaded}
        />

        <Formik
          initialValues={
            initialData || {
              leaveType: '',
              leaveFormat: '',
              reason: '',
              startDate: '',
              endDate: '',
            }
          }
          validationSchema={leaveRequestSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched }) => (
            <Form className="space-y-4">
              {step === 1 && (
                <div>
                  <h5 className="text-xl font-medium text-gray-900 dark:text-white">
                    เลือกประเภทการลา
                  </h5>
                  <div className="space-y-4">
                    {[
                      'ลากิจ',
                      'ลาป่วย',
                      'ลาพักร้อน',
                      'ลาโดยใช้ชั่วโมง OT',
                      'ลาโดยไม่ได้รับค่าจ้าง',
                    ].map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`block w-full p-2.5 text-center border rounded-lg ${
                          values.leaveType === type
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-50 text-gray-900'
                        }`}
                        onClick={() => {
                          values.leaveType = type;
                          handleNextStep();
                        }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h5 className="text-xl font-medium text-gray-900 dark:text-white">
                    เลือกลักษณะการลา
                  </h5>
                  <div className="space-y-4">
                    {['ลาเต็มวัน', 'ลาครึ่งวัน'].map((format) => (
                      <button
                        key={format}
                        type="button"
                        className={`block w-full p-2.5 text-center border rounded-lg ${
                          values.leaveFormat === format
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-50 text-gray-900'
                        }`}
                        onClick={() => {
                          values.leaveFormat = format;
                          handleNextStep();
                        }}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label
                      htmlFor="startDate"
                      className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                    >
                      วันที่เริ่มลา
                    </label>
                    <Field
                      type="date"
                      id="startDate"
                      name="startDate"
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    />
                    <ErrorMessage
                      name="startDate"
                      component="div"
                      className="text-danger"
                    />
                  </div>
                  {values.leaveFormat === 'ลาเต็มวัน' && (
                    <div>
                      <label
                        htmlFor="endDate"
                        className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                      >
                        วันที่สิ้นสุด
                      </label>
                      <Field
                        type="date"
                        id="endDate"
                        name="endDate"
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                      />
                      <ErrorMessage
                        name="endDate"
                        component="div"
                        className="text-danger"
                      />
                    </div>
                  )}
                  <div className="button-container flex justify-between mt-4">
                    <button
                      type="button"
                      className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
                      onClick={handlePreviousStep}
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      type="button"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
                      onClick={handleNextStep}
                      disabled={
                        !values.startDate ||
                        (values.leaveFormat === 'ลาเต็มวัน' && !values.endDate)
                      }
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h5 className="text-xl font-medium text-gray-900 dark:text-white">
                    สาเหตุการลา
                  </h5>
                  <div className="space-y-4">
                    <label
                      htmlFor="reason"
                      className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                    >
                      ระบุเหตุผล
                    </label>
                    <Field
                      as="textarea"
                      id="reason"
                      name="reason"
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    />
                    <ErrorMessage
                      name="reason"
                      component="div"
                      className="text-danger"
                    />
                  </div>
                  <div className="button-container flex justify-between mt-4">
                    <button
                      type="button"
                      className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
                      onClick={handlePreviousStep}
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      type="submit"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
                    >
                      ยืนยัน
                    </button>
                  </div>
                </div>
              )}
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default LeaveRequestForm;
