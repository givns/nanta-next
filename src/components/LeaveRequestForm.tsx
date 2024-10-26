import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Formik, Field, Form, ErrorMessage, FormikProps } from 'formik';
import * as Yup from 'yup';
import { UserData } from '@/types/user';
import { LeaveBalanceData } from '@/types/LeaveService';
import { calculateFullDayCount } from '../lib/holidayUtils';
import LeaveBalanceCard from './LeaveBalanceCard';

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
  leaveBalance: LeaveBalanceData;
}

const leaveTypeMapping = {
  ลาป่วย: 'ลาป่วย',
  ลากิจ: 'ลากิจ',
  ลาพักร้อน: 'ลาพักร้อน',
  ลาโดยไม่ได้รับค่าจ้าง: 'ลาโดยไม่ได้รับค่าจ้าง',
};

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
  leaveBalance,
}) => {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const handleSubmit = async (values: FormValues) => {
    try {
      if (!userData.shiftCode) {
        throw new Error('User shift information is missing');
      }

      const fullDayCount = await calculateFullDayCount(
        values.startDate,
        values.endDate || values.startDate,
        values.leaveFormat,
        userData.shiftCode,
      );

      const summaryData = {
        ...values,
        leaveType:
          leaveTypeMapping[values.leaveType as keyof typeof leaveTypeMapping],
        employeeId: userData.employeeId,
        lineUserId: userData.lineUserId,
        resubmitted: isResubmission,
        fullDayCount,
        userShift: userData.shiftCode,
      };

      sessionStorage.setItem('leaveSummary', JSON.stringify(summaryData));
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
      <p>แผนก: {userData.departmentName}</p>
    </div>
  );

  const renderStep1 = ({ values, setFieldValue }: FormikProps<FormValues>) => (
    <div className="flex flex-col h-full">
      {renderUserInfo()}
      <LeaveBalanceCard
        leaveBalance={leaveBalance}
        onSelectLeaveType={(type) => setFieldValue('leaveType', type)}
        selectedType={values.leaveType}
      />
      <button
        onClick={() => setStep(3)}
        disabled={!values.leaveType}
        className="w-full py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400"
      >
        ถัดไป: เลือกประเภทการลา
      </button>
    </div>
  );

  const renderStep3 = (setFieldValue: (field: string, value: any) => void) => (
    <div className="rounded-box bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">เลือกลักษณะการลา</h2>
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
    <div className="rounded-box bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">เลือกวันที่ลา</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="startDate" className="block mb-1">
            วันที่เริ่มลา
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
              วันที่สิ้นสุด
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
        className="mt-4 w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition duration-300"
      >
        Next
      </button>
    </div>
  );

  const renderStep5 = () => (
    <div className="rounded-box bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">ระบุเหตุการลา</h2>
      <div>
        <label htmlFor="reason" className="block mb-1">
          เหตุผล
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
        className="mt-4 w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition duration-300"
      >
        {isLoading ? 'กำลังสร้างแบบฟอร์ม...' : 'ยืนยัน'}
      </button>
    </div>
  );

  if (isLoading) {
    return <div>Loading leave request form...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
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
        {(formikProps) => (
          <Form className="space-y-6">
            {step === 1 && renderStep1(formikProps)}
            {step === 3 && renderStep3(formikProps.setFieldValue)}
            {step === 4 && renderStep4(formikProps.values)}
            {step === 5 && renderStep5()}
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default LeaveRequestForm;
function setFieldValue(arg0: string, type: string) {
  throw new Error('Function not implemented.');
}
