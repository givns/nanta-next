import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { useRouter } from 'next/router';
import 'dayjs/locale/th';
import liff from '@line/liff';
import Head from 'next/head';
import { ILeaveService } from '@/types/LeaveService';
import { LeaveServiceClient } from '@/services/LeaveServiceClient';

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
  lineUserId: string | null;
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
});

const LeaveRequestForm: React.FC<LeaveRequestFormProps> = ({
  initialData,
  isResubmission = false,
}) => {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<number | null>(null);
  const leaveService: ILeaveService = useMemo(
    () => new LeaveServiceClient(),
    [],
  );

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

  const fetchLeaveBalance = useCallback(
    async (userId: string) => {
      try {
        const balance = await leaveService.checkLeaveBalance(userId);
        setLeaveBalance(balance);
      } catch (error) {
        console.error('Error fetching leave balance:', error);
      }
    },
    [leaveService],
  );

  useEffect(() => {
    if (lineUserId) {
      fetchLeaveBalance(lineUserId);
    }
  }, [lineUserId, fetchLeaveBalance]);

  useEffect(() => {
    const startInput = startDateRef.current;
    const endInput = endDateRef.current;

    const handleStartDateChange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const startDate = target.value;
      if (endInput) {
        endInput.min = startDate;
      }
    };

    const handleEndDateChange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const endDate = target.value;
      if (startInput) {
        startInput.max = endDate;
      }
    };

    if (startInput && endInput) {
      startInput.addEventListener('change', handleStartDateChange);
      endInput.addEventListener('change', handleEndDateChange);
    }

    return () => {
      if (startInput)
        startInput.removeEventListener('change', handleStartDateChange);
      if (endInput) endInput.removeEventListener('change', handleEndDateChange);
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
    try {
      if (!lineUserId) {
        throw new Error('User ID not available');
      }

      const leaveRequest = await leaveService.createLeaveRequest(
        lineUserId,
        values.leaveType,
        values.leaveFormat,
        values.startDate,
        values.endDate,
        values.reason,
        calculateFullDayCount(values.startDate, values.endDate),
        false, // Assuming useOvertimeHours is false by default
      );
      console.log('Leave request submitted:', leaveRequest);

      // Store the submission data in session storage
      const submissionData = {
        ...values,
        lineUserId,
        resubmitted: isResubmission,
      };
      sessionStorage.setItem('leaveSummary', JSON.stringify(submissionData));

      router.push('/leave-summary');
    } catch (error) {
      console.error('Error submitting leave request:', error);
      alert('Error submitting leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateFullDayCount = (
    startDate: string,
    endDate: string,
  ): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // Including both start and end date
  };

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, user-scalable=no"
        />
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
            {isResubmission ? 'แบบฟอร์มขอลางานใหม่' : 'แบบฟอร์มขอลางาน'}
          </h5>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            วันลาคงเหลือ:{' '}
            {leaveBalance !== null ? leaveBalance : 'กำลังโหลด...'} วัน
          </p>
          <Formik
            initialValues={
              initialData || {
                leaveType: '',
                leaveFormat: '',
                reason: '',
                startDate: '',
                endDate: '',
              }
            }
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
                      {[
                        'ลากิจ',
                        'ลาป่วย',
                        'ลาพักร้อน',
                        'ลาโดยใช้ชั่วโมง OT',
                        'ลาโดยไม่ได้รับค่าจ้าง',
                      ].map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={`block w-full p-2.5 text-center border rounded-lg ${
                            values.leaveType === type
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-50 text-gray-900'
                          }`}
                          onClick={() => setFieldValue('leaveType', type)}
                        >
                          {type}
                        </button>
                      ))}
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
                      {['ลาเต็มวัน', 'ลาครึ่งวัน'].map((format) => (
                        <button
                          key={format}
                          type="button"
                          className={`block w-full p-2.5 text-center border rounded-lg ${
                            values.leaveFormat === format
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-50 text-gray-900'
                          }`}
                          onClick={() => setFieldValue('leaveFormat', format)}
                        >
                          {format}
                        </button>
                      ))}
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
