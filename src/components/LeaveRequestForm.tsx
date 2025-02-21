import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  Formik,
  Field,
  Form,
  ErrorMessage,
  FormikProps,
  FieldProps,
} from 'formik';
import * as Yup from 'yup';
import { UserData } from '@/types/user';
import { LeaveBalanceData } from '@/types/LeaveService';
import { calculateFullDayCount } from '../lib/holidayUtils';
import LeaveBalanceCard from './LeaveBalanceCard';
import ThaiDatePicker from './ThaiDatePicker';

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
  startDate: Yup.string().required('กรุณาเลือกวันที่เริ่มลา'),
  endDate: Yup.string().when('leaveFormat', {
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

      console.log('Form values:', values); // Debug log

      const fullDayCount = await calculateFullDayCount(
        values.startDate,
        values.leaveFormat === 'ลาครึ่งวัน' ? values.startDate : values.endDate,
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

      console.log('Summary data:', summaryData); // Debug log
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
        onClick={() => values.leaveType && setStep(2)}
        disabled={!values.leaveType}
        className="w-full py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-150"
      >
        ถัดไป: เลือกลักษณะการลา
      </button>
    </div>
  );

  const renderStep2 = ({ setFieldValue }: FormikProps<FormValues>) => (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="w-full max-w-sm mx-auto rounded-box bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-6 text-center">
          เลือกลักษณะการลา
        </h2>
        <div className="space-y-3">
          {['ลาเต็มวัน', 'ลาครึ่งวัน'].map((format) => (
            <button
              key={format}
              type="button"
              className="w-full p-4 text-center border border-gray-200 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              onClick={() => {
                setFieldValue('leaveFormat', format);
                setStep(3);
              }}
            >
              <span className="text-gray-800 font-medium">{format}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep3 = ({ values, setFieldValue }: FormikProps<FormValues>) => (
    <div className="rounded-box bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">เลือกวันที่ลา</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="startDate" className="block mb-1 text-gray-700">
            วันที่เริ่มลา
          </label>
          <Field name="startDate">
            {({ field, form }: FieldProps) => (
              <ThaiDatePicker
                field={field}
                form={form}
                onChange={(date) => setFieldValue('startDate', date)}
              />
            )}
          </Field>
          <ErrorMessage
            name="startDate"
            component="div"
            className="text-red-500 text-sm mt-1"
          />
        </div>
        {values.leaveFormat === 'ลาเต็มวัน' && (
          <div>
            <label htmlFor="endDate" className="block mb-1 text-gray-700">
              วันที่สิ้นสุด
            </label>
            <Field name="endDate">
              {({ field, form }: FieldProps) => (
                <ThaiDatePicker
                  field={field}
                  form={form}
                  onChange={(date) => setFieldValue('endDate', date)}
                />
              )}
            </Field>
            <ErrorMessage
              name="endDate"
              component="div"
              className="text-red-500 text-sm mt-1"
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setStep(4)}
        disabled={
          !values.startDate ||
          (values.leaveFormat === 'ลาเต็มวัน' && !values.endDate)
        }
        className="mt-6 w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        ถัดไป: ระบุเหตุการลา
      </button>
    </div>
  );

  const renderStep4 = () => (
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
        initialValues={{
          leaveType: '',
          leaveFormat: '',
          reason: '',
          startDate: '',
          endDate: '',
          ...initialData,
        }}
        validationSchema={leaveRequestSchema}
        onSubmit={handleSubmit}
      >
        {(formikProps) => (
          <Form className="space-y-6">
            {step === 1 && renderStep1(formikProps)}
            {step === 2 && renderStep2(formikProps)}
            {step === 3 && renderStep3(formikProps)}
            {step === 4 && renderStep4()}
          </Form>
        )}
      </Formik>
    </div>
  );
};
export default LeaveRequestForm;
