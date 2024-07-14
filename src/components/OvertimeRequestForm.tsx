import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { OvertimeRequest } from '@prisma/client';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import liff from '@line/liff';
import { formatTime } from '../utils/dateUtils';

const OvertimeRequestSchema = Yup.object().shape({
  date: Yup.date().required('Required'),
  hours: Yup.number()
    .required('Required')
    .positive('Must be positive')
    .integer('Must be an integer'),
  reason: Yup.string().required('Required'),
});

interface OvertimeRequestFormProps {
  userData: {
    name: string;
    employeeId: string;
  };
  departmentName: string;
}

const OvertimeRequestForm: React.FC<OvertimeRequestFormProps> = ({
  userData,
  departmentName,
}) => {
  const [lineUserId, setLineUserId] = useState('');
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then((profile) => {
            setLineUserId(profile.userId);
            fetchUserOvertimeRequests(profile.userId);
          });
        } else {
          liff.login();
        }
      });
    } else {
      console.error('LIFF ID is not defined');
    }
  }, []);

  const fetchUserOvertimeRequests = async (userId: string) => {
    try {
      const response = await axios.get(
        `/api/overtime/user-requests?userId=${userId}`,
      );
      setRequests(response.data);
    } catch (error) {
      console.error('Error fetching overtime requests:', error);
      setMessage('Failed to fetch overtime requests');
    }
  };

  const handleSubmit = async (
    values: any,
    { setSubmitting, resetForm }: any,
  ) => {
    setMessage('');
    try {
      const { date, hours, reason } = values;
      const startTime = '18:00';
      const endTime = new Date(
        new Date(`2000-01-01T${startTime}`).getTime() + hours * 60 * 60 * 1000,
      )
        .toTimeString()
        .slice(0, 5);

      await axios.post('/api/overtime/request', {
        userId: lineUserId,
        date,
        startTime,
        endTime,
        reason,
      });

      setMessage('คำขอทำงานล่วงเวลาถูกส่งเรียบร้อยแล้ว');
      resetForm();
      fetchUserOvertimeRequests(lineUserId);
    } catch (error) {
      console.error('Error submitting overtime request:', error);
      setMessage('ไม่สามารถส่งคำขอทำงานล่วงเวลาได้');
    } finally {
      setSubmitting(false);
    }
  };

  if (!lineUserId) {
    return <div>กำลังโหลด...</div>;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <p className="text-2xl font-bold">{userData.name}</p>
      <p className="text-xl">(รหัสพนักงาน: {userData.employeeId})</p>
      <p className="mb-4 text-gray-600">แผนก: {departmentName}</p>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="text-lg font-semibold mb-2">คำขอทำงานล่วงเวลา</h2>
        <Formik
          initialValues={{ date: '', hours: '', reason: '' }}
          validationSchema={OvertimeRequestSchema}
          onSubmit={handleSubmit}
        >
          {({ isSubmitting }) => (
            <Form className="space-y-4">
              <div>
                <label
                  htmlFor="date"
                  className="block text-sm font-medium text-gray-700"
                >
                  วันที่
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
                <label
                  htmlFor="hours"
                  className="block text-sm font-medium text-gray-700"
                >
                  จำนวนชั่วโมง
                </label>
                <Field
                  type="number"
                  id="hours"
                  name="hours"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
                <ErrorMessage
                  name="hours"
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
                disabled={isSubmitting}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
              >
                ส่งคำขอ
              </button>
            </Form>
          )}
        </Formik>
        {message && (
          <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
        )}
      </div>

      <div className="bg-gray-100 p-4 rounded-lg">
        <h3 className="text-md font-semibold mb-2">คำขอทำงานล่วงเวลาของคุณ</h3>
        {requests.length > 0 ? (
          <ul className="space-y-4">
            {requests.map((request) => (
              <li
                key={request.id}
                className="bg-white p-3 rounded-md shadow-sm"
              >
                <p>
                  วันที่: {new Date(request.date).toLocaleDateString('th-TH')}
                </p>
                <p>
                  เวลาเริ่ม:{' '}
                  <span className="font-medium">
                    {formatTime(request.startTime)}
                  </span>
                </p>
                <p>
                  เวลาสิ้นสุด:{' '}
                  <span className="font-medium">
                    {formatTime(request.endTime)}
                  </span>
                </p>
                <p>
                  สถานะ:{' '}
                  <span
                    className={`font-medium ${request.status === 'approved' ? 'text-green-600' : request.status === 'denied' ? 'text-red-600' : 'text-yellow-600'}`}
                  >
                    {request.status === 'approved'
                      ? 'อนุมัติแล้ว'
                      : request.status === 'denied'
                        ? 'ปฏิเสธแล้ว'
                        : 'รอการอนุมัติ'}
                  </span>
                </p>
                <p>เหตุผล: {request.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>ไม่มีคำขอทำงานล่วงเวลา</p>
        )}
      </div>
    </div>
  );
};

export default OvertimeRequestForm;
