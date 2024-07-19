import React, { useState, useCallback, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage, FieldProps } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import { formatTime } from '../utils/dateUtils';
import TimePickerField from './TimePickerField';

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
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);
  const [existingRequests, setExistingRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

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

  const fetchExistingRequests = async () => {
    try {
      const response = await axios.get(
        `/api/overtime/existing-requests?lineUserId=${lineUserId}`,
      );
      setExistingRequests(response.data);
    } catch (error) {
      console.error('Error fetching existing requests:', error);
      setMessage('ไม่สามารถดึงข้อมูลคำขอที่มีอยู่ได้');
    }
  };

  useEffect(() => {
    if (lineUserId) {
      fetchExistingRequests();
    }
  }, [lineUserId]);

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

  const handleExistingRequestSelect = (request: any) => {
    setSelectedRequest(request);
    setSelectedDate(request.date);
    fetchShiftInfo(request.date);
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'รอการอนุมัติ';
      case 'approved':
        return 'อนุมัติแล้ว';
      case 'denied':
        return 'ปฏิเสธแล้ว';
      default:
        return status;
    }
  };

  const handleDateSubmit = (values: { date: string }) => {
    setSelectedDate(values.date);
    fetchShiftInfo(values.date);
  };

  const handleOvertimeSubmit = async (values: any) => {
    try {
      const endpoint = selectedRequest
        ? `/api/overtime/update-request/${selectedRequest.id}`
        : '/api/overtime/request';

      const response = await axios.post(endpoint, {
        lineUserId,
        date: selectedDate,
        ...values,
      });

      setIsSubmitSuccess(true);
      setMessage(
        selectedRequest
          ? 'คำขอทำงานล่วงเวลาถูกอัปเดตเรียบร้อยแล้ว'
          : 'คำขอทำงานล่วงเวลาถูกส่งเรียบร้อยแล้ว',
      );

      // Close LIFF window after a short delay
      setTimeout(() => {
        liff.closeWindow();
      }, 3000);
    } catch (error) {
      console.error('Error submitting overtime request:', error);
      setMessage('ไม่สามารถส่งคำขอทำงานล่วงเวลาได้');
    }
  };

  if (!lineUserId) {
    return (
      <div className="flex justify-center items-center h-screen">
        กำลังโหลด...
      </div>
    );
  }

  if (isSubmitSuccess) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">
              ส่งคำขอสำเร็จ
            </h3>
            <p className="mt-1 text-sm text-gray-500">{message}</p>
            <p className="mt-3 text-sm text-gray-500">
              หน้าต่างนี้จะปิดอัตโนมัติใน 3 วินาที
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">คำขอทำงานล่วงเวลา</h2>
            <div>
              <h3 className="text-lg font-semibold mb-2">คำขอที่มีอยู่</h3>
              {existingRequests.length > 0 ? (
                <ul className="space-y-2">
                  {existingRequests.map((request) => (
                    <li key={request.id} className="border p-2 rounded">
                      <button
                        onClick={() => handleExistingRequestSelect(request)}
                        className="w-full text-left"
                      >
                        <div>
                          {new Date(request.date).toLocaleDateString()} -{' '}
                          {request.startTime} to {request.endTime}
                        </div>
                        <div className="text-sm text-gray-500">
                          สถานะ: {getStatusText(request.status)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>ไม่มีคำขอที่มีอยู่</p>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">สร้างคำขอใหม่</h3>
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
            </div>
          </div>
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
            initialValues={
              selectedRequest || {
                overtimeType: '',
                startTime: '',
                endTime: '',
                reason: '',
              }
            }
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
                  name="startTime"
                  component={TimePickerField}
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
                  name="endTime"
                  component={TimePickerField}
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

        {message && !isSubmitSuccess && (
          <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
        )}
      </div>
    </div>
  );
};

export default OvertimeRequestForm;
