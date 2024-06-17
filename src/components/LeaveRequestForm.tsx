import React from 'react';
import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import 'flowbite';

const leaveLimits: { [key: string]: number } = {
  ลาพักร้อน: 6,
  ลากิจ: 3,
  ลาป่วย: 30,
};

const leaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string()
    .required('กรุณาเลือกประเภทการลา')
    .test('check-leave-limit', 'สิทธิ์การลาที่เลือกหมดแล้ว', function (value) {
      return value ? leaveLimits[value] > 0 : true;
    }),
  halfDay: Yup.string()
    .nullable()
    .test('required-half-day', 'กรุณาเลือกครึ่งวัน', function (value) {
      const { leaveType } = this.parent;
      return leaveType === 'ลาครึ่งวัน' ? !!value : true;
    }),
  fullDayCount: Yup.number()
    .nullable()
    .min(1, 'กรุณาระบุจำนวนวันที่ต้องการลา')
    .test(
      'required-full-day-count',
      'กรุณาระบุจำนวนวันที่ต้องการลา',
      function (value) {
        const { leaveType } = this.parent;
        return leaveType === 'ลาเต็มวัน' ? !!value : true;
      },
    ),
  startDate: Yup.date().required('กรุณาเลือกวันที่เริ่มต้น'),
  endDate: Yup.date()
    .nullable()
    .test('required-end-date', 'กรุณาเลือกวันที่สิ้นสุด', function (value) {
      const { fullDayCount } = this.parent;
      return fullDayCount && fullDayCount > 1 ? !!value : true;
    }),
  reason: Yup.string().required('กรุณาระบุเหตุผล'),
});

const LeaveRequestForm = () => {
  const handleSubmit = async (
    values: any,
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    try {
      const response = await axios.post('/api/leaveRequest', values);
      if (response.data.success) {
        alert('คำขอการลาสำเร็จ');
      } else {
        alert('เกิดข้อผิดพลาด');
      }
    } catch (error) {
      console.error('Error submitting leave request:', error);
      alert('เกิดข้อผิดพลาดในการส่งคำขอ');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateProgress = (values: any) => {
    if (values.reason) return 100;
    if (values.startDate) return 66;
    if (values.leaveType) return 33;
    return 0;
  };

  return (
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
      {({ values, isSubmitting }) => (
        <Form className="space-y-6">
          <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
            <div className="mb-1 text-base font-medium dark:text-white">
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${calculateProgress(values)}%` }}
                ></div>
              </div>
            </div>
            <h5 className="text-xl font-medium text-gray-900 dark:text-white">
              ลงทะเบียนพนักงาน
            </h5>

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
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              >
                <option value="">เลือกประเภทการลา</option>
                {Object.keys(leaveLimits).map(
                  (key) =>
                    leaveLimits[key] > 0 && (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ),
                )}
              </Field>
              <ErrorMessage
                name="leaveType"
                component="div"
                className="text-danger"
              />
            </div>

            {values.leaveType === 'ลาครึ่งวัน' && (
              <div>
                <label
                  htmlFor="halfDay"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  เลือกครึ่งวัน
                </label>
                <Field
                  as="select"
                  name="halfDay"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                >
                  <option value="">เลือกครึ่งวัน</option>
                  <option value="เช้า">ครึ่งวันเช้า</option>
                  <option value="บ่าย">ครึ่งวันบ่าย</option>
                </Field>
                <ErrorMessage
                  name="halfDay"
                  component="div"
                  className="text-danger"
                />
              </div>
            )}

            {values.leaveType === 'ลาเต็มวัน' && (
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
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
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
                วันที่เริ่มต้น
              </label>
              <Field
                type="date"
                name="startDate"
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              />
              <ErrorMessage
                name="startDate"
                component="div"
                className="text-danger"
              />
            </div>

            {values.fullDayCount && values.fullDayCount > 1 && (
              <div>
                <label
                  htmlFor="endDate"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  วันที่สิ้นสุด
                </label>
                <Field
                  type="date"
                  name="endDate"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                />
                <ErrorMessage
                  name="endDate"
                  component="div"
                  className="text-danger"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="reason"
                className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
              >
                สาเหตุ
              </label>
              <Field
                as="textarea"
                name="reason"
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              />
              <ErrorMessage
                name="reason"
                component="div"
                className="text-danger"
              />
            </div>

            <div className="button-container flex justify-end">
              <button
                type="submit"
                className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
              >
                ถัดไป
              </button>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
};

export default LeaveRequestForm;
