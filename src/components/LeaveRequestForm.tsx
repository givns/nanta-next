import React, { useState, useEffect } from 'react';
import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';

const leaveLimits: { [key: string]: number } = {
  ลาพักร้อน: 6,
  ลากิจ: 3,
  ลาป่วย: 30,
};

const leaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string()
    .required('Required')
    .test('leaveType', 'Limit exceeded', function (value) {
      if (value && leaveLimits[value] !== undefined) {
        return leaveLimits[value] > 0;
      }
      return true;
    }),
  duration: Yup.string().required('Required'),
  halfDay: Yup.string().when('duration', {
    is: 'halfDay',
    then: (schema) => schema.required('Required'),
  }),
  fullDayCount: Yup.number().when('duration', {
    is: 'fullDay',
    then: (schema) => schema.required('Required').min(1),
  }),
  startDate: Yup.string().required('Required'),
  endDate: Yup.string().when('fullDayCount', {
    is: (val: number) => val > 1,
    then: (schema) => schema.required('Required'),
  }),
  reason: Yup.string().required('Required'),
});

const LeaveRequestForm = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [step, setStep] = useState(1);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then((profile) => {
            setLineUserId(profile.userId);
            setProfilePictureUrl(profile.pictureUrl);
          });
        } else {
          liff.login();
        }
      });
    } else {
      console.error('LIFF ID is not defined');
    }
  }, []);

  const handleNextStep = () => {
    setStep(step + 1);
  };

  const handleSubmit = async (
    values: {
      leaveType: string;
      duration: string;
      halfDay: string;
      fullDayCount: number;
      startDate: string;
      endDate: string;
      reason: string;
    },
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    try {
      const response = await axios.post('/api/leaveRequest', {
        ...values,
        lineUserId,
        profilePictureUrl,
      });
      if (response.data.success) {
        liff.closeWindow();
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-4">
        <div
          className="bg-blue-600 h-2.5 rounded-full dark:bg-blue-500"
          style={{ width: `${(step / 3) * 100}%` }}
        ></div>
      </div>
      <h5 className="text-xl font-medium text-gray-900 dark:text-white">
        ลงทะเบียนพนักงาน
      </h5>
      <Formik
        initialValues={{
          leaveType: '',
          duration: '',
          halfDay: '',
          fullDayCount: 1,
          startDate: '',
          endDate: '',
          reason: '',
        }}
        validationSchema={leaveRequestSchema}
        onSubmit={handleSubmit}
      >
        {({ values, isSubmitting }) => (
          <Form className="space-y-6">
            {step === 1 && (
              <div>
                <label
                  htmlFor="leaveType"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  ประเภทการลา
                </label>
                <Field
                  as="select"
                  name="leaveType"
                  id="leaveType"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                >
                  <option value="">เลือกประเภทการลา</option>
                  {leaveLimits['ลาพักร้อน'] > 0 && (
                    <option value="ลาพักร้อน">ลาพักร้อน</option>
                  )}
                  {leaveLimits['ลากิจ'] > 0 && (
                    <option value="ลากิจ">ลากิจ</option>
                  )}
                  {leaveLimits['ลาป่วย'] > 0 && (
                    <option value="ลาป่วย">ลาป่วย</option>
                  )}
                  <option value="ลาโดยไม่รับค่าจ้าง">ลาโดยไม่รับค่าจ้าง</option>
                </Field>
                <ErrorMessage
                  name="leaveType"
                  component="div"
                  className="text-danger"
                />
                <div className="button-container flex justify-end">
                  <button
                    type="button"
                    className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    onClick={handleNextStep}
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <label
                  htmlFor="duration"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  ระยะเวลา
                </label>
                <Field
                  as="select"
                  name="duration"
                  id="duration"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                >
                  <option value="">เลือกระยะเวลา</option>
                  <option value="halfDay">ลาครึ่งวัน</option>
                  <option value="fullDay">ลาเต็มวัน</option>
                </Field>
                <ErrorMessage
                  name="duration"
                  component="div"
                  className="text-danger"
                />
                {values.duration === 'halfDay' && (
                  <div>
                    <Field
                      as="select"
                      name="halfDay"
                      id="halfDay"
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    >
                      <option value="">เลือกครึ่งวัน</option>
                      <option value="morning">ครึ่งวันเช้า</option>
                      <option value="afternoon">ครึ่งวันบ่าย</option>
                    </Field>
                    <ErrorMessage
                      name="halfDay"
                      component="div"
                      className="text-danger"
                    />
                  </div>
                )}
                {values.duration === 'fullDay' && (
                  <div>
                    <label
                      htmlFor="fullDayCount"
                      className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                    >
                      จำนวนวันที่ต้องการลา
                    </label>
                    <Field
                      type="number"
                      name="fullDayCount"
                      id="fullDayCount"
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    />
                    <ErrorMessage
                      name="fullDayCount"
                      component="div"
                      className="text-danger"
                    />
                  </div>
                )}
                <div className="button-container flex justify-end">
                  <button
                    type="button"
                    className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    onClick={handleNextStep}
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                {values.fullDayCount === 1 ? (
                  <div>
                    <label
                      htmlFor="startDate"
                      className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                    >
                      วันที่ต้องการลา
                    </label>
                    <Field
                      type="date"
                      name="startDate"
                      id="startDate"
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    />
                    <ErrorMessage
                      name="startDate"
                      component="div"
                      className="text-danger"
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="dateRange"
                      className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                    >
                      ช่วงวันที่ต้องการลา
                    </label>
                    <div date-rangepicker className="flex items-center">
                      <div className="relative">
                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                          <svg
                            className="w-4 h-4 text-gray-500 dark:text-gray-400"
                            aria-hidden="true"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M20 4a2 2 0 0 0-2-2h-2V1a1 1 0 0 0-2 0v1h-3V1a1 1 0 0 0-2 0v1H6V1a1 1 0 0 0-2 0v1H2a2 2 0 0 0-2 2v2h20V4ZM0 18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8H0v10Zm5-8h10a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2Z" />
                          </svg>
                        </div>
                        <Field
                          type="date"
                          name="startDate"
                          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full ps-10 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                          placeholder="Select start date"
                        />
                      </div>
                      <span className="mx-4 text-gray-500">to</span>
                      <div className="relative">
                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                          <svg
                            className="w-4 h-4 text-gray-500 dark:text-gray-400"
                            aria-hidden="true"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M20 4a2 2 0 0 0-2-2h-2V1a1 1 0 0 0-2 0v1h-3V1a1 1 0 0 0-2 0v1H6V1a1 1 0 0 0-2 0v1H2a2 2 0 0 0-2 2v2h20V4ZM0 18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8H0v10Zm5-8h10a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2Z" />
                          </svg>
                        </div>
                        <Field
                          type="date"
                          name="endDate"
                          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full ps-10 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                          placeholder="Select end date"
                        />
                      </div>
                    </div>
                    <ErrorMessage
                      name="startDate"
                      component="div"
                      className="text-danger"
                    />
                    <ErrorMessage
                      name="endDate"
                      component="div"
                      className="text-danger"
                    />
                  </div>
                )}
                <label
                  htmlFor="reason"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  สาเหตุการลา
                </label>
                <Field
                  type="text"
                  name="reason"
                  id="reason"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                />
                <ErrorMessage
                  name="reason"
                  component="div"
                  className="text-danger"
                />
                <div className="button-container flex justify-end">
                  <button
                    type="submit"
                    className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    disabled={isSubmitting}
                  >
                    ส่งคำขอ
                  </button>
                </div>
              </div>
            )}
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default LeaveRequestForm;
