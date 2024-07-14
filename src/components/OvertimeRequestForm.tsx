import React, { useState, useCallback, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import { formatTime } from '../utils/dateUtils';

const DateSchema = Yup.object().shape({
  date: Yup.date().required('กรุณาเลือกวันที่'),
});

const OvertimeSchema = Yup.object().shape({
  overtimeType: Yup.string().required('กรุณาเลือกประเภทการทำงานล่วงเวลา'),
  startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
  endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
  reason: Yup.string().required('กรุณาระบุเหตุผล'),
});

const OvertimeRequestForm: React.FC = () => {
  const [step, setStep] = useState(1);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [shiftInfo, setShiftInfo] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [message, setMessage] = useState('');

  const initializeLiff = useCallback(async () => {
    try {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
      } else {
        liff.login();
      }
    } catch (error) {
      console.error('LIFF initialization failed', error);
      setMessage('ไม่สามารถเชื่อมต่อกับ LINE ได้');
    }
  }, []);

  useEffect(() => {
    initializeLiff();
  }, [initializeLiff]);

  const fetchShiftInfo = async (date: string) => {
    try {
      const response = await axios.get(
        `/api/overtime/shift-info?lineUserId=${lineUserId}&date=${date}`,
      );
      setShiftInfo(response.data);
      setStep(2);
    } catch (error) {
      console.error('Error fetching shift info:', error);
      setMessage('ไม่สามารถดึงข้อมูลกะการทำงานได้');
    }
  };

  const handleDateSubmit = (values: { date: string }) => {
    setSelectedDate(values.date);
    fetchShiftInfo(values.date);
  };

  const handleOvertimeSubmit = async (values: any) => {
    try {
      await axios.post('/api/overtime/request', {
        lineUserId,
        date: selectedDate,
        ...values,
      });
      setMessage('คำขอทำงานล่วงเวลาถูกส่งเรียบร้อยแล้ว');
      setStep(1);
    } catch (error) {
      console.error('Error submitting overtime request:', error);
      setMessage('ไม่สามารถส่งคำขอทำงานล่วงเวลาได้');
    }
  };

  if (!lineUserId) {
    return <div>กำลังโหลด...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      {step === 1 && (
        <Formik
          initialValues={{ date: '' }}
          validationSchema={DateSchema}
          onSubmit={handleDateSubmit}
        >
          <Form className="space-y-4">
            <div>
              <label
                htmlFor="date"
                className="block text-sm font-medium text-gray-700"
              >
                วันที่ขอทำงานล่วงเวลา
              </label>
              <Field
                type="date"
                id="date"
                name="date"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
              <ErrorMessage
                name="date"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              ถัดไป
            </button>
          </Form>
        </Formik>
      )}

      {step === 2 && shiftInfo && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">ข้อมูลพนักงานและกะการทำงาน</h2>
          <p>
            ชื่อ (ชื่อเล่น): {shiftInfo.name} ({shiftInfo.nickname})
          </p>
          <p>รหัสพนักงาน: {shiftInfo.employeeId}</p>
          <p>แผนก: {shiftInfo.department}</p>
          <p>
            กะการทำงาน: {shiftInfo.shift.name} (
            {formatTime(shiftInfo.shift.startTime)} -{' '}
            {formatTime(shiftInfo.shift.endTime)})
          </p>
          <button
            onClick={() => setStep(3)}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            ยืนยันและดำเนินการต่อ
          </button>
        </div>
      )}

      {step === 3 && (
        <Formik
          initialValues={{
            overtimeType: '',
            startTime: '',
            endTime: '',
            reason: '',
          }}
          validationSchema={OvertimeSchema}
          onSubmit={handleOvertimeSubmit}
        >
          <Form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                ประเภทการทำงานล่วงเวลา
              </label>
              <div className="mt-2 space-x-4">
                <label className="inline-flex items-center">
                  <Field
                    type="radio"
                    name="overtimeType"
                    value="beforeShift"
                    className="form-radio"
                  />
                  <span className="ml-2">ก่อนกะ</span>
                </label>
                <label className="inline-flex items-center">
                  <Field
                    type="radio"
                    name="overtimeType"
                    value="afterShift"
                    className="form-radio"
                  />
                  <span className="ml-2">หลังกะ</span>
                </label>
              </div>
              <ErrorMessage
                name="overtimeType"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="startTime"
                className="block text-sm font-medium text-gray-700"
              >
                เวลาเริ่มต้น
              </label>
              <Field
                type="time"
                id="startTime"
                name="startTime"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
              <ErrorMessage
                name="startTime"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="endTime"
                className="block text-sm font-medium text-gray-700"
              >
                เวลาสิ้นสุด
              </label>
              <Field
                type="time"
                id="endTime"
                name="endTime"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
              <ErrorMessage
                name="endTime"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="reason"
                className="block text-sm font-medium text-gray-700"
              >
                เหตุผล
              </label>
              <Field
                as="textarea"
                id="reason"
                name="reason"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              />
              <ErrorMessage
                name="reason"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              ส่งคำขอทำงานล่วงเวลา
            </button>
          </Form>
        </Formik>
      )}

      {message && (
        <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
      )}
    </div>
  );
};

export default OvertimeRequestForm;
