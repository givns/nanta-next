import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Formik, Field, Form, ErrorMessage } from 'formik';
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
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const handleBalanceLoaded = (balance: LeaveBalanceData) => {
    setLeaveBalance(balance);
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      if (!userData || !userData.id) {
        throw new Error('User data not available');
      }

      const englishLeaveType =
        leaveTypeMapping[values.leaveType as ThaiLeaveType];

      sessionStorage.setItem(
        'leaveSummary',
        JSON.stringify({
          ...values,
          leaveType: englishLeaveType,
          userId: userData.id,
          lineUserId: userData.lineUserId,
          resubmitted: isResubmission,
        }),
      );

      router.push('/leave-summary');
    } catch (error) {
      console.error('Error submitting leave request:', error);
      setError(
        error instanceof Error ? error.message : 'An unknown error occurred',
      );
    }
  };

  const renderUserInfo = () => (
    <div className="bg-white rounded-box p-4 mb-4">
      <h2 className="text-lg font-semibold mb-2">ข้อมูลพนักงาน</h2>
      <p>ชื่อ-สกุล: {userData.name}</p>
      <p>รหัสพนักงาน: {userData.employeeId}</p>
      <p>แผนก: {userData.department}</p>
    </div>
  );

  const renderStep1 = () => (
    <div className="flex flex-col h-full">
      {renderUserInfo()}
      <div className="bg-white rounded-box mb-4">
        <LeaveBalanceComponent
          userId={userData.id}
          onBalanceLoaded={handleBalanceLoaded}
        />
      </div>
      <button
        onClick={() => setStep(2)}
        className="bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition duration-300"
      >
        Next: Choose Leave Type
      </button>
    </div>
  );

  const renderStep2 = (setFieldValue: (field: string, value: any) => void) => (
    <div className="bg-white rounded-box p-4 mb-4">
      <h2 className="text-lg font-semibold mb-4">Choose Leave Type</h2>
      <div className="space-y-2">
        {Object.keys(leaveTypeMapping).map((type) => (
          <button
            key={type}
            type="button"
            className="w-full p-2 text-left border rounded-lg hover:bg-gray-100"
            onClick={() => {
              setFieldValue('leaveType', type);
              setStep(3);
            }}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep3 = (setFieldValue: (field: string, value: any) => void) => (
    <div className="bg-white rounded-box p-4 mb-4">
      <h2 className="text-lg font-semibold mb-4">Choose Leave Format</h2>
      <div className="space-y-2">
        {['ลาเต็มวัน', 'ลาครึ่งวัน'].map((format) => (
          <button
            key={format}
            type="button"
            className="w-full p-2 text-left border rounded-lg hover:bg-gray-100"
            onClick={() => {
              setFieldValue('leaveFormat', format);
              setStep(4);
            }}
          >
            {format}
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep4 = (values: FormValues) => (
    <div className="bg-white rounded-box p-4 mb-4">
      <h2 className="text-lg font-semibold mb-4">Select Dates</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="startDate" className="block mb-1">
            Start Date
          </label>
          <Field
            type="date"
            id="startDate"
            name="startDate"
            className="w-full p-2 border rounded"
          />
          <ErrorMessage
            name="startDate"
            component="div"
            className="text-red-500"
          />
        </div>
        {values.leaveFormat === 'ลาเต็มวัน' && (
          <div>
            <label htmlFor="endDate" className="block mb-1">
              End Date
            </label>
            <Field
              type="date"
              id="endDate"
              name="endDate"
              className="w-full p-2 border rounded"
            />
            <ErrorMessage
              name="endDate"
              component="div"
              className="text-red-500"
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setStep(5)}
        className="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
      >
        Next
      </button>
    </div>
  );

  const renderStep5 = () => (
    <div className="bg-white rounded-box p-4 mb-4">
      <h2 className="text-lg font-semibold mb-4">Reason for Leave</h2>
      <div>
        <label htmlFor="reason" className="block mb-1">
          Reason
        </label>
        <Field
          as="textarea"
          id="reason"
          name="reason"
          className="w-full p-2 border rounded"
          rows={3}
        />
        <ErrorMessage name="reason" component="div" className="text-red-500" />
      </div>
      <button
        type="submit"
        className="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition duration-300"
      >
        Submit Leave Request
      </button>
    </div>
  );

  if (isLoading) {
    return <div>Loading leave request form...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!userData) {
    return <div>No user data available.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-6">
          {isResubmission ? 'แบบฟอร์มขอลางานใหม่' : 'แบบฟอร์มขอลางาน'}
        </h1>

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
            <Form>
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2(setFieldValue)}
              {step === 3 && renderStep3(setFieldValue)}
              {step === 4 && renderStep4(values)}
              {step === 5 && renderStep5()}
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default LeaveRequestForm;
