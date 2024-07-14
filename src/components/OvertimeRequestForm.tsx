import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { UserData, ShiftData } from '../types/user';
import { formatTime } from '../utils/dateUtils';
import liff from '@line/liff';

const OvertimeRequestSchema = Yup.object().shape({
  date: Yup.date().required('กรุณาเลือกวันที่'),
  overtimeType: Yup.string().required('กรุณาเลือกประเภทการทำงานล่วงเวลา'),
  startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
  endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
  reason: Yup.string().required('กรุณาระบุเหตุผล'),
});

const OvertimeRequestForm: React.FC = () => {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    initializeLiff();
  }, []);

  const initializeLiff = async () => {
    try {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
        fetchUserAndShiftDetails(profile.userId);
      } else {
        liff.login();
      }
    } catch (error) {
      console.error('LIFF initialization failed', error);
      setMessage('ไม่สามารถเชื่อมต่อกับ LINE ได้');
    }
  };

  const fetchUserAndShiftDetails = async (userId: string) => {
    try {
      const [userResponse, shiftResponse] = await Promise.all([
        axios.get(`/api/users?lineUserId=${userId}`),
        axios.get(`/api/shifts/shifts?action=user&lineUserId=${userId}`),
      ]);
      setUserData(userResponse.data);
      setShift(shiftResponse.data);
    } catch (error) {
      console.error('Error fetching user and shift details:', error);
      setMessage('ไม่สามารถดึงข้อมูลผู้ใช้และกะการทำงานได้');
    }
  };

  const handleSubmit = async (
    values: any,
    { setSubmitting, resetForm }: any,
  ) => {
    setMessage('');
    try {
      const adjustmentResponse = await axios.get(
        `/api/shifts/shifts?action=adjustment&lineUserId=${lineUserId}&date=${values.date}`,
      );
      const adjustedShift = adjustmentResponse.data;

      await axios.post('/api/overtime/request', {
        lineUserId,
        ...values,
        shiftId: adjustedShift ? adjustedShift.id : shift?.id,
      });
      setMessage('คำขอทำงานล่วงเวลาถูกส่งเรียบร้อยแล้ว');
      resetForm();
    } catch (error) {
      console.error('Error submitting overtime request:', error);
      setMessage('ไม่สามารถส่งคำขอทำงานล่วงเวลาได้');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateHours = (startTime: string, endTime: string) => {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    if (end < start) end.setDate(end.getDate() + 1);
    const diff = (end.getTime() - start.getTime()) / 3600000;
    return diff.toFixed(2);
  };

  if (!lineUserId || !userData || !shift) {
    return <div>กำลังโหลด...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <p className="text-2xl font-bold">{userData.name}</p>
      <p className="text-xl">(รหัสพนักงาน: {userData.employeeId})</p>
      <p className="mb-4 text-gray-600">แผนก: {userData.department}</p>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="text-lg font-semibold mb-2">ข้อมูลกะการทำงาน</h2>
        <p>
          <span className="font-medium">{shift.name}</span> (
          {formatTime(shift.startTime)} - {formatTime(shift.endTime)})
        </p>
      </div>

      <Formik
        initialValues={{
          date: '',
          overtimeType: '',
          startTime: '',
          endTime: '',
          reason: '',
        }}
        validationSchema={OvertimeRequestSchema}
        onSubmit={handleSubmit}
      >
        {({ isSubmitting, values }) => (
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
            {values.startTime && values.endTime && (
              <div>
                <p>
                  จำนวนชั่วโมงทำงานล่วงเวลา:{' '}
                  {calculateHours(values.startTime, values.endTime)} ชั่วโมง
                </p>
              </div>
            )}
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
              disabled={isSubmitting}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
            >
              ส่งคำขอทำงานล่วงเวลา
            </button>
          </Form>
        )}
      </Formik>

      {message && (
        <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
      )}
    </div>
  );
};

export default OvertimeRequestForm;
