// Code for the OvertimeRequestForm component
import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import { format, parseISO } from 'date-fns';
import { UserRole } from '@/types/enum';
import liff from '@line/liff';

interface OvertimeRequestFormProps {
  liff: typeof liff;
  lineUserId: string;
  userData: UserData;
  employees: any[];
  isManager: boolean;
}

const OvertimeRequestForm: React.FC<OvertimeRequestFormProps> = ({
  liff,
  lineUserId,
  userData,
  employees,
  isManager,
}) => {
  const [existingRequests, setExistingRequests] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
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
          // `this` context contains the form values and other metadata
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

      let requestData;

      if (isManager) {
        requestData = {
          lineUserId,
          employeeIds: values.employeeIds,
          date: newRequestDate,
          startTime: values.startTime,
          endTime: values.endTime,
          reason: values.reason,
        };
      } else {
        requestData = {
          lineUserId,
          employeeId: userData?.employeeId,
          date: newRequestDate,
          startTime: values.startTime,
          endTime: values.endTime,
          reason: values.reason,
        };
      }

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

  if (isLoading) {
    return <div className="text-center">กำลังโหลด...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-box p-4 mb-4">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {isManager ? 'สร้างคำขอทำงานล่วงเวลา' : 'คำขอทำงานล่วงเวลา'}
          </h2>

          <Formik
            initialValues={{
              employeeIds: [],
              startTime: userData?.shiftCode
                ? formatTime(userData.shiftCode.split('-')[1])
                : '',
              endTime: '',
              reason: '',
              isManager, // Add this to initial values
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

          {message && (
            <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OvertimeRequestForm;
