import React, { useEffect, useRef, useState } from 'react';
import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import 'dayjs/locale/th';
import liff from '@line/liff';
import Head from 'next/head';

interface FormValues {
  leaveType: string;
  leaveFormat: string;
  reason: string;
  startDate: string;
  endDate: string;
  fullDayCount: number;
}

const leaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string().required('กรุณาเลือกประเภทการลา'),
  leaveFormat: Yup.string().required('กรุณาเลือกลักษณะการลา'),
  reason: Yup.string().required('กรุณาระบุเหตุผล'),
  startDate: Yup.date().required('กรุณาเลือกวันที่เริ่มลา'),
  endDate: Yup.date().when('leaveFormat', {
    is: 'ลาเต็มวัน',
    then: (schema) => schema.required('กรุณาเลือกวันที่สิ้นสุด'),
  }),
  fullDayCount: Yup.number()
    .min(0.5, 'จำนวนวันต้องมากกว่าหรือเท่ากับ 0.5')
    .required('กรุณาระบุจำนวนวัน'),
});

const LeaveRequestForm: React.FC = () => {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Add loading state

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
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    console.log('Form is submitting with values:', values);
    setLoading(true); // Set loading to true when submitting the form
    try {
      const leaveData = {
        userId: lineUserId,
        leaveType: values.leaveType,
        leaveFormat: values.leaveFormat,
        reason: values.reason,
        startDate: new Date(values.startDate),
        endDate:
          values.leaveFormat === 'ลาครึ่งวัน'
            ? new Date(values.startDate)
            : new Date(values.endDate),
        status: 'Pending',
        fullDayCount:
          values.leaveFormat === 'ลาครึ่งวัน' ? 0.5 : values.fullDayCount,
      };

      console.log('Submitting leaveData:', leaveData);

      sessionStorage.setItem('leaveSummary', JSON.stringify(leaveData));
      router.push('/leave-summary');
    } catch (error) {
      console.error('Error submitting leave request:', error);
      alert('Error submitting leave request');
    } finally {
      setLoading(false); // Set loading to false when the submission is complete
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <style>
          {`
            input,
            textarea,
            select {
              font-size: 16px;
            }
          `}
        </style>
      </Head>
      <div className="main-container flex justify-center items-center h-screen">
        <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-4">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${(step / 3) * 100}%` }}
            ></div>
          </div>
          <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
            แบบฟอร์มขอลางาน
          </h5>
          <Formik
            initialValues={{
              leaveType: '',
              leaveFormat: '',
              reason: '',
              startDate: '',
              endDate: '',
              fullDayCount: 0,
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
                          values.leaveFormat === 'ลาเต็มวัน'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-50 text-gray-900'
                        }`}
                        onClick={() => {
                          setFieldValue('leaveFormat', 'ลาเต็มวัน');
                          setFieldValue('fullDayCount', 1);
                        }}
                      >
                        ลาเต็มวัน
                      </button>
                      <button
                        type="button"
                        className={`block w-full p-2.5 text-center border rounded-lg ${
                          values.leaveFormat === 'ลาครึ่งวัน'
                            ? 'bg-blue-500 text-white'
                            : '                      bg-gray-50 text-gray-900'
                        }`}
                        onClick={() => {
                          setFieldValue('leaveFormat', 'ลาครึ่งวัน');
                          setFieldValue('fullDayCount', 0.5);
                        }}
                      >
                        ลาครึ่งวัน
                      </button>
                    </div>
                    <div>
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
                    {values.leaveFormat === 'ลาเต็มวัน' && (
                      <div>
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
                    )}
                    <div className="button-container flex justify-between mt-4">
                      <button
                        type="button"
                        className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
                        onClick={handlePreviousStep}
                      >
                        ย้อนกลับ
                      </button>
                      <button
                        type="button"
                        className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
                        onClick={handleNextStep}
                        disabled={
                          !values.startDate ||
                          (values.leaveFormat === 'ลาเต็มวัน' &&
                            !values.endDate)
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
                        className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
                        onClick={handlePreviousStep}
                      >
                        ย้อนกลับ
                      </button>
                      <button
                        type="submit"
                        className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
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
    </>
  );
};

export default LeaveRequestForm;
