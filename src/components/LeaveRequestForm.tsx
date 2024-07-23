import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Formik, Field, Form, ErrorMessage } from 'formik';
import axios from 'axios';
import * as Yup from 'yup';
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

const leaveTypeMapping = {
  ลากิจ: 'business',
  ลาป่วย: 'sick',
  ลาพักร้อน: 'annual',
  'ลาโดยใช้ชั่วโมง OT': 'overtime',
  ลาโดยไม่ได้รับค่าจ้าง: 'unpaid',
};

type ThaiLeaveType = keyof typeof leaveTypeMapping;
type EnglishLeaveType = (typeof leaveTypeMapping)[ThaiLeaveType];

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
  userData,
}) => {
  const [step, setStep] = useState(1);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  console.log('LeaveRequestForm rendered with userData:', userData);

  useEffect(() => {
    console.log('LeaveRequestForm useEffect triggered');
    setIsLoading(false);
  }, []);

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

  const handleSubmit = async (values: FormValues) => {
    try {
      if (!userData || !userData.id) {
        throw new Error('User data not available');
      }

      const englishLeaveType =
        leaveTypeMapping[values.leaveType as ThaiLeaveType];
      const leaveDays = calculateLeaveDays(values.startDate, values.endDate);

      // Check if the user has enough leave balance
      if (leaveBalance) {
        let availableDays: number;
        switch (englishLeaveType) {
          case 'sick':
            availableDays = leaveBalance.sickLeave;
            break;
          case 'business':
            availableDays = leaveBalance.businessLeave;
            break;
          case 'annual':
            availableDays = leaveBalance.annualLeave;
            break;
          case 'overtime':
            availableDays = leaveBalance.overtimeLeave;
            break;
          default:
            availableDays = Infinity; // For unpaid leave
        }

        if (leaveDays > availableDays) {
          throw new Error(`ไม่มีวันลา${values.leaveType}เพียงพอ`);
        }
      }

      const submissionData = {
        ...values,
        leaveType: englishLeaveType,
        userId: userData.id,
        fullDayCount: leaveDays,
        resubmitted: isResubmission,
      };

      const response = await axios.post(
        '/api/leaveRequest/create',
        submissionData,
      );

      if (response.status === 201) {
        console.log('Leave request submitted successfully');
        // Handle successful submission (e.g., show success message, redirect)
      } else {
        throw new Error(response.data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error submitting leave request:', error);
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred',
      );
    }
  };

  const handleNextStep = () => {
    setStep(step + 1);
  };

  const handlePreviousStep = () => {
    setStep(step - 1);
  };

  if (isLoading) {
    console.log('LeaveRequestForm is still loading');
    return <div>Loading leave request form...</div>;
  }

  if (error) {
    console.log('LeaveRequestForm encountered an error:', error);
    return <div>Error: {error}</div>;
  }

  if (!userData) {
    return <div>No user data available.</div>;
  }

  console.log('Rendering LeaveRequestForm content, current step:', step);

  return (
    <div
      className="main-container flex flex-col min-h-screen bg-gray-100"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <h1 className="text-2xl font-bold text-center mb-6 pt-4">
        {isResubmission ? 'แบบฟอร์มขอลางานใหม่' : 'แบบฟอร์มขอลางาน'}
      </h1>

      <div className="flex-grow p-4">
        <div className="rounded-box bg-white p-6 shadow-lg">
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
            {({ values, setFieldValue }) => (
              <Form className="space-y-4">
                {step === 1 && (
                  <div>
                    <h5 className="text-xl font-medium text-gray-900 dark:text-white">
                      เลือกประเภทการลา
                    </h5>
                    <div className="space-y-4">
                      {Object.keys(leaveTypeMapping).map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={`block w-full p-2.5 text-center border rounded-lg ${
                            values.leaveType === type
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-50 text-gray-900'
                          }`}
                          onClick={() => {
                            setFieldValue('leaveType', type);
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
                        className="text-red-500"
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
                          className="text-red-500"
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
                          (values.leaveFormat === 'ลาเต็มวัน' &&
                            !values.endDate)
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
                        className="text-red-500"
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
      {error && <div className="mt-4 text-red-500">{error}</div>}
    </div>
  );
};

export default LeaveRequestForm;
