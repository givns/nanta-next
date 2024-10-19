import React, { useState } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import {
  formatTime,
  getBangkokTime,
  formatBangkokTime,
} from '../utils/dateUtils';
import TimePickerField from './TimePickerField';
import { UserData } from '@/types/user';
import liff from '@line/liff';

interface OvertimeRequestFormProps {
  lineUserId: string;
  userData: UserData;
  employees: any[];
  isManager: boolean;
}

const OvertimeRequestForm: React.FC<OvertimeRequestFormProps> = ({
  lineUserId,
  userData,
  employees,
  isManager,
}) => {
  const [message, setMessage] = useState('');
  const [newRequestDate, setNewRequestDate] = useState(
    formatBangkokTime(getBangkokTime(), 'yyyy-MM-dd'),
  );

  const OvertimeSchema = Yup.object().shape({
    employeeIds: Yup.array()
      .of(Yup.string())
      .test(
        'is-employee-selected',
        'เลือกพนักงานอย่างน้อย 1 คน',
        function (value) {
          const { isManager } = this.parent;
          if (isManager) {
            return value && value.length > 0;
          }
          return true;
        },
      ),
    startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
    endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
    reason: Yup.string().required('กรุณาระบุเหตุผล'),
    isManager: Yup.boolean(),
  });

  const handleOvertimeSubmit = async (values: any) => {
    try {
      const endpoint = isManager
        ? '/api/overtime/create-manager-request'
        : '/api/overtime/request';

      const requestData = isManager
        ? {
            lineUserId,
            employeeIds: values.employeeIds,
            date: newRequestDate,
            startTime: values.startTime,
            endTime: values.endTime,
            reason: values.reason,
          }
        : {
            lineUserId,
            employeeId: userData?.employeeId,
            date: newRequestDate,
            startTime: values.startTime,
            endTime: values.endTime,
            reason: values.reason,
          };

      const response = await axios.post(endpoint, requestData);
      console.log('Overtime request submitted:', response.data);

      setMessage('คำขอทำงานล่วงเวลาถูกส่งเรียบร้อยแล้ว');
      setTimeout(() => {
        liff.closeWindow();
      }, 3000);
    } catch (error) {
      console.error('Error submitting overtime request:', error);
      setMessage('ไม่สามารถส่งคำขอทำงานล่วงเวลาได้');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6">
        {isManager ? 'แบบฟอร์มขอทำ OT ' : 'ไม่สามาขอทำ OT ได้'}
      </h1>

      <div className="bg-white rounded-box p-4 mb-4">
        <Formik
          initialValues={{
            employeeIds: [],
            startTime: '18:00',
            endTime: '19:00',
            reason: '',
            isManager,
          }}
          validationSchema={OvertimeSchema}
          onSubmit={handleOvertimeSubmit}
        >
          {({ isSubmitting }) => (
            <Form className="space-y-4">
              {isManager && (
                <div>
                  <label
                    htmlFor="employeeIds"
                    className="block text-sm font-medium text-gray-700"
                  >
                    เลือกพนักงาน
                  </label>
                  <Field
                    as="select"
                    id="employeeIds"
                    name="employeeIds"
                    multiple
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                  >
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </Field>
                  <ErrorMessage
                    name="employeeIds"
                    component="div"
                    className="text-red-500 text-sm"
                  />
                </div>
              )}
              <div>
                <label
                  htmlFor="date"
                  className="block text-sm font-medium text-gray-700"
                >
                  วันที่
                </label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={newRequestDate}
                  onChange={(e) => setNewRequestDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
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
                  defaultTime="18:00" // Set default time here
                  className="border-gray-300 focus:border-indigo-500"
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
                  defaultTime="19:00" // Set default time here
                  className="border-gray-300 focus:border-indigo-500"
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

        {message && (
          <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
        )}
      </div>
    </div>
  );
};

export default OvertimeRequestForm;
