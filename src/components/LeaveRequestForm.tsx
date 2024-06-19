import React, { useEffect, useRef, useState } from 'react';
import { Formik, Field, Form, ErrorMessage, FormikHelpers } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import 'flowbite';
import 'dayjs/locale/th';
import liff from '@line/liff';

interface FormValues {
  leaveType: string;
  startDate: string;
  endDate: string;
}

const leaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string().required('กรุณาเลือกประเภทการลา'),
  startDate: Yup.date().required('กรุณาเลือกวันที่เริ่มลา'),
  endDate: Yup.date().required('กรุณาเลือกวันที่สิ้นสุด'),
});

const LeaveRequestForm: React.FC = () => {
  const router = useRouter();
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff
        .init({ liffId })
        .then(() => {
          if (liff.isLoggedIn()) {
            liff
              .getProfile()
              .then((profile) => {
                setLineUserId(profile.userId);
              })
              .catch((err) => {
                console.error('Error getting profile:', err);
              });
          } else {
            liff.login();
          }
        })
        .catch((err) => {
          console.error('Error initializing LIFF:', err);
        });
    }
  }, []);

  const handleSubmit = async (
    values: FormValues,
    { setSubmitting }: FormikHelpers<FormValues>,
  ) => {
    console.log('Form is submitting with values:', values);
    try {
      const leaveData = {
        userId: lineUserId,
        leaveType: values.leaveType,
        startDate: new Date(values.startDate),
        endDate: new Date(values.endDate),
        status: 'Pending',
      };

      console.log('Submitting leaveData:', leaveData);

      const response = await fetch('/api/leaveRequest/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(leaveData),
      });

      if (response.ok) {
        console.log('Leave request created successfully');
        sessionStorage.setItem('leaveSummary', JSON.stringify(leaveData));
        router.push('/leave-summary');
      } else {
        const errorData = await response.json();
        console.error(`Error: ${errorData.error}`);
        alert(`Error: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error submitting leave request:', error);
      alert('Error submitting leave request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          แบบฟอร์มขอลางาน
        </h5>
        <Formik
          initialValues={{
            leaveType: '',
            startDate: '',
            endDate: '',
          }}
          validationSchema={leaveRequestSchema}
          onSubmit={handleSubmit}
        >
          {({ values, setFieldValue, isSubmitting }) => (
            <Form id="leaveRequestForm" className="space-y-6">
              <div>
                <h5 className="text-xl font-medium text-gray-900 dark:text-white">
                  เลือกประเภทการลา
                </h5>
                <div className="space-y-4">
                  <button
                    type="button"
                    className={`block w-full p-2.5 text-center border rounded-lg ${
                      values.leaveType === 'ลากิจ'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 text-gray-900'
                    }`}
                    onClick={() => setFieldValue('leaveType', 'ลากิจ')}
                  >
                    ลากิจ 📅
                  </button>
                  <button
                    type="button"
                    className={`block w-full p-2.5 text-center border rounded-lg ${
                      values.leaveType === 'ลาป่วย'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 text-gray-900'
                    }`}
                    onClick={() => setFieldValue('leaveType', 'ลาป่วย')}
                  >
                    ลาป่วย 😷
                  </button>
                  <button
                    type="button"
                    className={`block w-full p-2.5 text-center border rounded-lg ${
                      values.leaveType === 'ลาพักร้อน'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 text-gray-900'
                    }`}
                    onClick={() => setFieldValue('leaveType', 'ลาพักร้อน')}
                  >
                    ลาพักร้อน 🏖️
                  </button>
                  <button
                    type="button"
                    className={`block w-full p-2.5 text-center border rounded-lg ${
                      values.leaveType === 'ลาโดยไม่ได้รับค่าจ้าง'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 text-gray-900'
                    }`}
                    onClick={() =>
                      setFieldValue('leaveType', 'ลาโดยไม่ได้รับค่าจ้าง')
                    }
                  >
                    ลาโดยไม่ได้รับค่าจ้าง ❌
                  </button>
                </div>
                <div className="mt-4">
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
                    innerRef={startDateRef}
                  />
                  <ErrorMessage
                    name="startDate"
                    component="div"
                    className="text-danger"
                  />
                </div>
                <div className="mt-4">
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
                    innerRef={endDateRef}
                  />
                  <ErrorMessage
                    name="endDate"
                    component="div"
                    className="text-danger"
                  />
                </div>
                <div className="button-container flex justify-end mt-4">
                  <button
                    type="submit"
                    className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    disabled={isSubmitting}
                  >
                    ยืนยัน
                  </button>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default LeaveRequestForm;
