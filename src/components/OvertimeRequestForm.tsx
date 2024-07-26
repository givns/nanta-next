import React, { useState, useCallback, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import { formatTime } from '../utils/dateUtils';
import TimePickerField from './TimePickerField';
import { UserData } from '@/types/user';
import moment from 'moment-timezone';

const OvertimeSchema = Yup.object().shape({
  startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
  endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
  reason: Yup.string().required('กรุณาระบุเหตุผล'),
});

const OvertimeRequestForm: React.FC = () => {
  const [step, setStep] = useState(1);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [existingRequests, setExistingRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [newRequestDate, setNewRequestDate] = useState(
    moment().format('YYYY-MM-DD'),
  );

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          await fetchUserData(profile.userId);
          await fetchExistingRequests(profile.userId);
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('LIFF initialization failed', error);
        setMessage('ไม่สามารถเชื่อมต่อกับ LINE ได้');
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, []);

  const fetchUserData = async (lineUserId: string) => {
    try {
      const response = await axios.get(`/api/users?lineUserId=${lineUserId}`);
      setUserData(response.data.user);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setMessage('ไม่สามารถดึงข้อมูลผู้ใช้ได้');
    }
  };

  const fetchExistingRequests = async (lineUserId: string) => {
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

  const handleExistingRequestSelect = (request: any) => {
    setSelectedRequest(request);
    setStep(3);
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

  const handleOvertimeSubmit = async (values: any) => {
    try {
      const endpoint = selectedRequest
        ? `/api/overtime/update-request/${selectedRequest.id}`
        : '/api/overtime/request';

      const response = await axios.post(endpoint, {
        lineUserId,
        ...values,
      });

      setMessage(
        selectedRequest
          ? 'คำขอทำงานล่วงเวลาถูกอัปเดตเรียบร้อยแล้ว'
          : 'คำขอทำงานล่วงเวลาถูกส่งเรียบร้อยแล้ว',
      );
      setTimeout(() => {
        liff.closeWindow();
      }, 3000);
    } catch (error) {
      console.error('Error submitting overtime request:', error);
      setMessage('ไม่สามารถส่งคำขอทำงานล่วงเวลาได้');
    }
  };

  if (isLoading) {
    return <div className="text-center">กำลังโหลด...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-box shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-center">
            คำขอทำงานล่วงเวลา
          </h2>
          {step === 1 && (
            <div className="space-y-4">
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
                            สถานะ: {request.status}
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
                <div className="mb-4">
                  <label
                    htmlFor="newRequestDate"
                    className="block text-sm font-medium text-gray-700"
                  >
                    วันที่
                  </label>
                  <input
                    type="date"
                    id="newRequestDate"
                    value={newRequestDate}
                    onChange={(e) => setNewRequestDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                  />
                </div>
                <button
                  onClick={() => {
                    if (newRequestDate) {
                      setStep(3);
                    } else {
                      setMessage('กรุณาเลือกวันที่ก่อนสร้างคำขอใหม่');
                    }
                  }}
                  className="w-full py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  สร้างคำขอใหม่
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <Formik
              initialValues={
                selectedRequest || {
                  startTime: userData?.assignedShift?.endTime || '',
                  endTime: '',
                  reason: '',
                }
              }
              validationSchema={OvertimeSchema}
              onSubmit={handleOvertimeSubmit}
            >
              {({ isSubmitting }) => (
                <Form className="space-y-4">
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
                      rows={3}
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
                    className="w-full py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400"
                  >
                    {isSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอทำงานล่วงเวลา'}
                  </button>
                </Form>
              )}
            </Formik>
          )}

          {message && (
            <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OvertimeRequestForm;
