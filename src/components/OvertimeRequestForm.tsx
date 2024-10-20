import React, { useEffect, useState } from 'react';
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import {
  formatTime,
  getBangkokTime,
  formatBangkokTime,
} from '../utils/dateUtils';
import { CalendarIcon } from 'lucide-react';
import { UserData } from '@/types/user';
import liff from '@line/liff';
import { th } from 'date-fns/locale';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import ThaiDatePicker from './ThaiDatePicker';
import TimePickerField from './TimePickerField';
import { Checkbox } from './ui/checkbox';

interface OvertimeRequestFormProps {
  lineUserId: string;
  userData: UserData;
  employees: any[];
  isManager: boolean;
}

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
  departmentId: Yup.string().required('กรุณาเลือกแผนก'),
  startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
  endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
  commonReasons: Yup.array().min(1, 'เลือกเหตุผลอย่างน้อย 1 ข้อ'),
  reasonDetails: Yup.array().of(
    Yup.object().shape({
      reason: Yup.string().required('กรุณาระบุรายละเอียด'),
    }),
  ),
  isManager: Yup.boolean(),
});

const commonReasons = [
  'วัตถุดิบมาไม่ตรงเวลา',
  'จำนวนผลิตมากกว่าปกติ',
  'คนทำงานไม่เพียงพอ',
  'การผลิตใช้เวลานานกว่าที่คาดการไว้',
  'ซ่อมบำรุง',
  'ปัญหาด้านคุณภาพสินค้า',
  'การเปลี่ยนแปลงคำสั่งผลิตกะทันหัน',
  'การฝึกอบรมพิเศษ',
  'การส่งมอบเร่งด่วน',
  'ปัญหาเอกสาร',
  'การตรวจสอบคุณภาพเพิ่มเติม',
  'มีรอบส่งสินค้าเพิ่มเติม',
];

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
  const [departments, setDepartments] = useState([]);
  const [step, setStep] = useState(1);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await axios.get('/api/departments');
        setDepartments(response.data);
      } catch (error) {
        console.error('Error fetching departments:', error);
        setMessage('ไม่สามารถดึงข้อมูลแผนกได้');
      }
    };

    fetchDepartments();
  }, []);

  const handleOvertimeSubmit = async (values: any) => {
    try {
      const endpoint = isManager
        ? '/api/overtime/create-manager-request'
        : '/api/overtime/request';

      const formattedReasons = values.commonReasons.map(
        (reason: string, index: number) => ({
          reason,
          details: values.reasonDetails[index]?.reason || '',
        }),
      );

      const requestData = {
        lineUserId,
        employeeIds: isManager ? values.employeeIds : [userData?.employeeId],
        departmentId: values.departmentId,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        reasons: formattedReasons,
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
  const renderStep = (
    values: any,
    setFieldValue: any,
    isSubmitting: boolean,
  ) => {
    switch (step) {
      case 1:
        return (
          <>
            <h2 className="text-lg font-semibold mb-4">เลือกแผนกและพนักงาน</h2>
            <div className="mb-4">
              <label
                htmlFor="departmentId"
                className="block text-sm font-medium text-gray-700"
              >
                แผนก
              </label>
              <Field
                as="select"
                id="departmentId"
                name="departmentId"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              >
                <option value="">เลือกแผนก</option>
                {departments.map((dept: any) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Field>
              <ErrorMessage
                name="departmentId"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            {isManager && (
              <div className="mb-4">
                <label
                  htmlFor="employeeIds"
                  className="block text-sm font-medium text-gray-700"
                >
                  พนักงาน
                </label>
                <Field
                  as="select"
                  id="employeeIds"
                  name="employeeIds"
                  multiple
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                >
                  {employees
                    .filter((emp) => emp.departmentId === values.departmentId)
                    .map((employee) => (
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
            <Button type="button" onClick={() => setStep(2)} className="w-full">
              ถัดไป
            </Button>
          </>
        );
      case 2:
        return (
          <>
            <h2 className="text-lg font-semibold mb-4">เลือกวันที่และเวลา</h2>
            <div className="mb-4">
              <label
                htmlFor="date"
                className="block text-sm font-medium text-gray-700"
              >
                วันที่
              </label>
              <Field name="date" component={ThaiDatePicker} />
              <ErrorMessage
                name="date"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor="startTime"
                className="block text-sm font-medium text-gray-700"
              >
                เวลาเริ่มต้น
              </label>
              <Field name="startTime" component={TimePickerField} />
              <ErrorMessage
                name="startTime"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div className="mb-4">
              <label
                htmlFor="endTime"
                className="block text-sm font-medium text-gray-700"
              >
                เวลาสิ้นสุด
              </label>
              <Field name="endTime" component={TimePickerField} />
              <ErrorMessage
                name="endTime"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div className="flex justify-between">
              <Button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3"
              >
                ย้อนกลับ
              </Button>
              <Button
                type="button"
                onClick={() => setStep(3)}
                className="w-1/3"
              >
                ถัดไป
              </Button>
            </div>
          </>
        );
      case 3:
        return (
          <>
            <h2 className="text-lg font-semibold mb-4">ระบุเหตุผล</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลือกเหตุผลทั่วไป (เลือกได้หลายข้อ)
              </label>
              <FieldArray name="commonReasons">
                {({ push, remove }) => (
                  <div>
                    {commonReasons.map((reason, index) => (
                      <div key={index} className="flex items-center mb-2">
                        <Checkbox
                          id={`reason-${index}`}
                          checked={values.commonReasons.includes(reason)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              push(reason);
                              setFieldValue(
                                `reasonDetails.${values.commonReasons.length}`,
                                { reason: '' },
                              );
                            } else {
                              const idx = values.commonReasons.indexOf(reason);
                              remove(idx);
                              setFieldValue(
                                `reasonDetails`,
                                values.reasonDetails.filter(
                                  (_: any, i: number) => i !== idx,
                                ),
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor={`reason-${index}`}
                          className="ml-2 text-sm text-gray-700"
                        >
                          {reason}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </FieldArray>
              <ErrorMessage
                name="commonReasons"
                component="div"
                className="text-red-500 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                รายละเอียดเพิ่มเติม
              </label>
              <FieldArray name="reasonDetails">
                {() => (
                  <div>
                    {values.commonReasons.map(
                      (reason: string, index: number) => (
                        <div key={index} className="mb-2">
                          <label
                            htmlFor={`reasonDetails.${index}.reason`}
                            className="block text-sm font-medium text-gray-700"
                          >
                            {reason}
                          </label>
                          <Field
                            as="textarea"
                            id={`reasonDetails.${index}.reason`}
                            name={`reasonDetails.${index}.reason`}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            rows={2}
                          />
                          <ErrorMessage
                            name={`reasonDetails.${index}.reason`}
                            component="div"
                            className="text-red-500 text-sm"
                          />
                        </div>
                      ),
                    )}
                  </div>
                )}
              </FieldArray>
            </div>
            <div className="flex justify-between">
              <Button
                type="button"
                onClick={() => setStep(2)}
                className="w-1/3"
              >
                ย้อนกลับ
              </Button>
              <Button type="submit" disabled={isSubmitting} className="w-1/3">
                {isSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอ'}
              </Button>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6">
        {isManager ? 'แบบฟอร์มขอทำ OT' : 'ขอทำ OT'}
      </h1>

      <div className="bg-white rounded-box p-4 mb-4">
        <Formik
          initialValues={{
            departmentId: '',
            employeeIds: [],
            date: formatBangkokTime(getBangkokTime(), 'yyyy-MM-dd'),
            startTime: '18:00',
            endTime: '19:00',
            commonReasons: [],
            reasonDetails: [],
            isManager,
          }}
          validationSchema={OvertimeSchema}
          onSubmit={handleOvertimeSubmit}
        >
          {({ values, setFieldValue, isSubmitting }) => (
            <Form className="space-y-4">
              {renderStep(values, setFieldValue, isSubmitting)}
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
