// src/components/LeaveRequestForm.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Formik, Field, Form, ErrorMessage, FormikHelpers } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import 'flowbite';
import 'dayjs/locale/th';
import liff from '@line/liff';

interface FormValues {
  leaveType: string;
  halfDay: 'ลาครึ่งวัน' | 'ลาครึ่งวันเช้า' | 'ลาครึ่งวันบ่าย' | '';
  fullDayCount: number;
  startDate: string;
  endDate: string;
  reason: string;
}

const leaveLimits: { [key: string]: number } = {
  ลากิจ: 3,
  ลาป่วย: 30,
  ลาพักร้อน: 6,
};

const leaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string()
    .nullable()
    .test('check-leave-limit', 'สิทธิ์การลาที่เลือกหมดแล้ว', function (value) {
      return value ? leaveLimits[value] > 0 : true;
    }),
  halfDay: Yup.string()
    .nullable()
    .test('required-half-day', 'กรุณาเลือกครึ่งวัน', function (value) {
      const { leaveType } = this.parent as FormValues;
      return leaveType === 'ลาครึ่งวัน' ? !!value : true;
    }),
  fullDayCount: Yup.number()
    .nullable()
    .min(0.5, 'กรุณาระบุจำนวนวันที่ต้องการลา')
    .test(
      'required-full-day-count',
      'กรุณาระบุจำนวนวันที่ต้องการลา',
      function (value) {
        const { leaveType } = this.parent as FormValues;
        return leaveType === 'ลาเต็มวัน' ? !!value : true;
      },
    ),
  startDate: Yup.date().nullable(),
  endDate: Yup.date().nullable(),
  reason: Yup.string().nullable(),
});

const LeaveRequestForm: React.FC = () => {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const [lineUserId, setLineUserId] = useState<string | null>(null);

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
                console.log('Profile:', profile);
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

  useEffect(() => {
    const startInput = startDateRef.current;
    const endInput = endDateRef.current;

    if (startInput && endInput) {
      startInput.addEventListener('change', (event: Event) => {
        const target = event.target as HTMLInputElement;
        const startDate = target.value;
        if (endInput) {
          endInput.min = startDate;
        }
      });

      endInput.addEventListener('change', (event: Event) => {
        const target = event.target as HTMLInputElement;
        const endDate = target.value;
        if (startInput) {
          startInput.max = endDate;
        }
      });
    }

    return () => {
      if (startInput) startInput.removeEventListener('change', () => {});
      if (endInput) endInput.removeEventListener('change', () => {});
    };
  }, []);

  const handleNextStep = () => {
    setStep(step + 1);
  };

  const handlePreviousStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async (
    values: FormValues,
    { setSubmitting }: FormikHelpers<FormValues>,
  ) => {
    console.log('Form is submitting with values:', values);
    try {
      const leaveData = {
        userId: lineUserId,
        leaveType: values.leaveType,
        leaveFormat: values.halfDay ? 'Half Day' : 'Full Day',
        reason: values.reason,
        startDate: new Date(values.startDate),
        endDate:
          values.halfDay || values.fullDayCount === 1
            ? new Date(values.startDate)
            : new Date(values.endDate),
        status: 'Pending',
        fullDayCount: values.halfDay ? 0.5 : values.fullDayCount,
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

      console.log('Response received:', response);

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
        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-4">
          <div
            className="bg-blue-600 h-2             .5 rounded-full"
            style={{ width: `${(step / 3) * 100}%` }}
          ></div>
        </div>
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          แบบฟอร์มขอลางาน
        </h5>
        <Formik
          initialValues={{
            leaveType: '',
            halfDay: '',
            fullDayCount: 0,
            startDate: '',
            endDate: '',
            reason: '',
          }}
          validationSchema={leaveRequestSchema}
          onSubmit={handleSubmit}
        >
          {({ values, setFieldValue, isSubmitting }) => (
            <Form id="leaveRequestForm" className="space-y-6">
              {step === 1 && (
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
                  <div className="button-container flex justify-end mt-4">
                    <button
                      type="button"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
                      onClick={handleNextStep}
                      disabled={!values.leaveType}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h5 className="text-xl font-medium text-gray-900 dark:text-white">
                    เลือกลักษณะการลา
                  </h5>
                  <div className="space-y-4">
                    <button
                      type="button"
                      className={`block w-full p-2.5 text-center border rounded-lg ${
                        values.leaveType === 'ลาเต็มวัน'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-50 text-gray-900'
                      }`}
                      onClick={() => {
                        setFieldValue('leaveType', 'ลาเต็มวัน');
                        setFieldValue('halfDay', '');
                        setFieldValue('fullDayCount', 1);
                      }}
                    >
                      ลาเต็มวัน
                    </button>
                    <button
                      type="button"
                      className={`block w-full p-2.5 text-center border rounded-lg ${
                        values.leaveType === 'ลาครึ่งวัน'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-50 text-gray-900'
                      }`}
                      onClick={() => {
                        setFieldValue('leaveType', 'ลาครึ่งวัน');
                        setFieldValue('fullDayCount', 0.5);
                      }}
                    >
                      ลาครึ่งวัน
                    </button>
                    {values.leaveType === 'ลาครึ่งวัน' && (
                      <div>
                        <label
                          htmlFor="halfDayType"
                          className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >
                          เลือกช่วงเวลา
                        </label>
                        <button
                          type="button"
                          className={`block w-full p-2.5 text-center border rounded-lg ${
                            values.halfDay === 'ลาครึ่งวันเช้า'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-50 text-gray-900'
                          }`}
                          onClick={() =>
                            setFieldValue('halfDay', 'ลาครึ่งวันเช้า')
                          }
                        >
                          ลาครึ่งวันเช้า
                        </button>
                        <button
                          type="button"
                          className={`block w-full p-2.5 text-center border rounded-lg ${
                            values.halfDay === 'ลาครึ่งวันบ่าย'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-50 text-gray-900'
                          }`}
                          onClick={() =>
                            setFieldValue('halfDay', 'ลาครึ่งวันบ่าย')
                          }
                        >
                          ลาครึ่งวันบ่าย
                        </button>
                      </div>
                    )}
                    {values.leaveType === 'ลาเต็มวัน' && (
                      <div>
                        <label
                          htmlFor="fullDayCount"
                          className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                        >
                          จำนวนวันที่ขอลา
                        </label>
                        <Field
                          type="number"
                          id="fullDayCount"
                          name="fullDayCount"
                          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                          min="1"
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setFieldValue(
                              'fullDayCount',
                              parseFloat(e.target.value),
                            )
                          }
                        />
                        <ErrorMessage
                          name="fullDayCount"
                          component="div"
                          className="text-danger"
                        />
                      </div>
                    )}
                    <div>
                      <label
                        htmlFor="startDate"
                        className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                      >
                        วันที่
                      </label>
                      <Field
                        type="date"
                        id="startDate"
                        name="startDate"
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                        innerRef={startDateRef}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setFieldValue('startDate', e.target.value);
                        }}
                      />
                      <ErrorMessage
                        name="startDate"
                        component="div"
                        className="text-danger"
                      />
                    </div>
                    {values.leaveType === 'ลาเต็มวัน' &&
                      values.fullDayCount > 1 && (
                        <div>
                          <label
                            htmlFor="endDate"
                            className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                          >
                            ถึงวันที่
                          </label>
                          <Field
                            type="date"
                            id="endDate"
                            name="endDate"
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                            innerRef={endDateRef}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) => {
                              setFieldValue('endDate', e.target.value);
                            }}
                          />
                          <ErrorMessage
                            name="endDate"
                            component="div"
                            className="text-danger"
                          />
                        </div>
                      )}
                  </div>
                  <div className="button-container flex justify-between mt-4">
                    <button
                      type="button"
                      className="py-2.5 px-5 me-2 mb-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
                      onClick={handlePreviousStep}
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      type="button"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                      onClick={handleNextStep}
                      disabled={
                        !values.startDate ||
                        (values.leaveType === 'ลาเต็มวัน' &&
                          values.fullDayCount > 1 &&
                          !values.endDate) ||
                        (values.leaveType === 'ลาครึ่งวัน' && !values.halfDay)
                      }
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h5 className="text-xl font-medium text-gray-900 dark:text-white">
                    สาเหตุการลา
                  </h5>
                  <div className="space-y-4">
                    <label
                      htmlFor="reason"
                      className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                    >
                      ระบุเหตุผล
                    </label>
                    <Field
                      as="textarea"
                      id="reason"
                      name="reason"
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                    />
                    <ErrorMessage
                      name="reason"
                      component="div"
                      className="text-danger"
                    />
                  </div>
                  <div className="button-container flex justify-between mt-4">
                    <button
                      type="button"
                      className="py-2.5 px-5 me-2 mb-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
                      onClick={handlePreviousStep}
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      type="submit"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                      disabled={isSubmitting}
                    >
                      ยืนยัน
                    </button>
                  </div>
                </div>
              )}
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default LeaveRequestForm;
