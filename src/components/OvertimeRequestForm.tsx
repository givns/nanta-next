import React, { useEffect, useState } from 'react';
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { getBangkokTime, formatBangkokTime } from '../utils/dateUtils';
import { UserData } from '@/types/user';
import liff from '@line/liff';
import ThaiDatePicker from './ThaiDatePicker';
import TimePickerField from './TimePickerField';
import { Checkbox } from './ui/checkbox';

interface OvertimeRequestFormProps {
  lineUserId: string;
  userData: UserData;
  employees: any[];
  departments: any[];
  isManager: boolean;
  isAdmin: boolean;
}

const OvertimeSchema = Yup.object().shape({
  departmentNames: Yup.array().test(
    'departmentNames',
    'กรุณาเลือกแผนก',
    function (value, context) {
      if (context.parent.isAdmin) {
        return (value && value.length > 0) || false;
      }
      return true;
    },
  ),
  employeeIds: Yup.array()
    .of(Yup.string())
    .min(1, 'เลือกพนักงานอย่างน้อย 1 คน'),
  date: Yup.string().required('กรุณาระบุวันที่'),
  startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
  endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
  commonReasons: Yup.array().min(1, 'เลือกเหตุผลอย่างน้อย 1 ข้อ'),
  reasonDetails: Yup.array().of(
    Yup.object().shape({
      reason: Yup.string().required('กรุณาระบุรายละเอียด'),
    }),
  ),
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
  'อื่นๆ',
];

const OvertimeRequestForm: React.FC<OvertimeRequestFormProps> = ({
  lineUserId,
  userData,
  employees,
  departments,
  isManager,
  isAdmin,
}) => {
  const [message, setMessage] = useState('');
  const [step, setStep] = useState(1);
  const [filteredEmployees, setFilteredEmployees] = useState<any[]>([]);

  useEffect(() => {
    if (isManager) {
      console.log("Manager's department:", userData.departmentName);
      const managerEmployees = employees.filter(
        (emp) => emp.departmentName === userData.departmentName,
      );
      console.log('Filtered employees for manager:', managerEmployees);
      setFilteredEmployees(managerEmployees);
    } else if (isAdmin) {
      setFilteredEmployees([]); // Admin starts with an empty list
    } else {
      setFilteredEmployees(employees); // Fallback, should not happen
    }
  }, [isManager, isAdmin, employees, userData.departmentName]);

  const isDayOff = (employee: any, date: Date) => {
    if (!employee.shift) return false;
    const dayOfWeek = date.getDay();
    return !employee.shift.workDays.includes(dayOfWeek);
  };

  const handleOvertimeSubmit = async (values: any, { setSubmitting }: any) => {
    console.log('handleOvertimeSubmit called with values:', values);
    try {
      const formattedReasons = values.commonReasons.map(
        (reason: string, index: number) => ({
          reason,
          details: values.reasonDetails[index]?.reason || '',
        }),
      );
      const durationMinutes = calculateDuration(
        values.startTime,
        values.endTime,
      );

      const requestData = {
        lineUserId,
        employeeIds: values.employeeIds,
        departmentNames: isAdmin
          ? values.departmentNames
          : [userData.departmentName],
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        durationMinutes,
        reasons: formattedReasons,
      };

      console.log('Sending request with data:', requestData);

      const response = await axios.post(
        '/api/overtime/create-manager-request',
        requestData,
      );
      console.log('Overtime request submitted:', response.data);

      setMessage('คำขอทำงานล่วงเวลาถูกส่งเรียบร้อยแล้ว');
      setTimeout(() => {
        liff.closeWindow();
      }, 1000);
    } catch (error) {
      console.error('Error submitting overtime request:', error);
      setMessage('ไม่สามารถส่งคำขอทำงานล่วงเวลาได้');
    } finally {
      setSubmitting(false);
    }
  };

  const formatThaiDate = (dateString: string) => {
    const date = new Date(dateString);
    const thaiYear = date.getFullYear() + 543;
    const thaiMonths = [
      'มกราคม',
      'กุมภาพันธ์',
      'มีนาคม',
      'เมษายน',
      'พฤษภาคม',
      'มิถุนายน',
      'กรกฎาคม',
      'สิงหาคม',
      'กันยายน',
      'ตุลาคม',
      'พฤศจิกายน',
      'ธันวาคม',
    ];
    return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${thaiYear}`;
  };

  // Helper function to calculate duration in minutes
  const calculateDuration = (startTime: string, endTime: string): number => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let durationMinutes =
      endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (durationMinutes < 0) {
      durationMinutes += 24 * 60; // Add 24 hours if end time is next day
    }

    return durationMinutes;
  };

  // Helper function to format duration
  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} ชั่วโมง ${remainingMinutes} นาที`;
  };

  const renderSummary = (values: any) => {
    const selectedEmployees = employees.filter((emp) =>
      values.employeeIds.includes(emp.employeeId),
    );
    const selectedDepartments = isAdmin
      ? departments.filter((dept) => values.departmentNames.includes(dept.name))
      : [{ name: userData.departmentName }];

    const overtimeDate = new Date(values.date);
    const employeesWithDayOffStatus = selectedEmployees.map((emp) => ({
      ...emp,
      isDayOff: isDayOff(emp, overtimeDate),
    }));

    // Calculate duration
    const durationMinutes = calculateDuration(values.startTime, values.endTime);
    const durationFormatted = formatDuration(durationMinutes);

    return (
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">สรุปคำขอทำงานล่วงเวลา</h3>
        <div className="space-y-2">
          <p>
            <strong>แผนก:</strong>{' '}
            {selectedDepartments.map((dept) => dept.name).join(', ')}
          </p>
          <p>
            <strong>พนักงาน:</strong>{' '}
            {employeesWithDayOffStatus.map((emp) => (
              <span key={emp.employeeId}>
                {emp.name} {emp.isDayOff ? '(วันหยุด)' : ''}
                {', '}
              </span>
            ))}
          </p>
          <p>
            <strong>วันที่:</strong> {formatThaiDate(values.date)}
          </p>
          <p>
            <strong>เวลา:</strong> {values.startTime} - {values.endTime} (
            {durationFormatted})
          </p>
          <div>
            <strong>เหตุผล:</strong>
            <ul className="list-disc list-inside">
              {values.commonReasons.map((reason: string, index: number) => (
                <li key={index}>
                  {reason}: {values.reasonDetails[index]?.reason || ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderStep = (
    values: any,
    setFieldValue: any,
    isSubmitting: boolean,
    submitForm: () => void,
    errors: any,
    touched: any,
  ) => {
    switch (step) {
      case 1:
        return (
          <>
            <div className="rounded-box bg-white p-6">
              <h2 className="text-lg font-semibold mb-4">
                เลือกแผนกและพนักงาน
              </h2>
              {isAdmin && (
                <div className="mb-4">
                  <label
                    htmlFor="departmentNames"
                    className="block text-sm font-medium text-gray-700"
                  >
                    แผนก
                  </label>
                  <Field
                    as="select"
                    id="departmentNames"
                    name="departmentNames"
                    multiple
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const selectedDeptNames = Array.from(
                        e.target.selectedOptions,
                        (option) => option.value,
                      );
                      setFieldValue('departmentNames', selectedDeptNames);
                      const selectedEmployees = employees.filter((emp) =>
                        selectedDeptNames.includes(emp.departmentName),
                      );
                      setFilteredEmployees(selectedEmployees);
                    }}
                  >
                    {departments.map((dept: any) => (
                      <option key={dept._id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </Field>
                  <ErrorMessage
                    name="departmentNames"
                    component="div"
                    className="text-red-500 text-sm"
                  />
                </div>
              )}
              {isManager && (
                <div className="mb-4">
                  <p className="block text-sm font-medium text-gray-700">
                    แผนก: {userData.departmentName}
                  </p>
                </div>
              )}
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
                  {filteredEmployees.map((employee) => (
                    <option
                      key={employee.employeeId}
                      value={employee.employeeId}
                    >
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
              <button
                type="button"
                onClick={() => setStep(2)}
                className="mt-4 w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition duration-300"
              >
                ถัดไป
              </button>
            </div>
          </>
        );
      case 2:
        return (
          <>
            <div className="rounded-box bg-white p-6">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ช่วงเวลาทำงานล่วงเวลา
                </label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <Field name="startTime" component={TimePickerField} />
                    <ErrorMessage
                      name="startTime"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                  <span className="text-gray-500">-</span>
                  <div className="flex-1">
                    <Field name="endTime" component={TimePickerField} />
                    <ErrorMessage
                      name="endTime"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition duration-300"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </>
        );
      case 3:
        return (
          <>
            <div className="rounded-box bg-white p-6">
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
                                const idx =
                                  values.commonReasons.indexOf(reason);
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
              <div className="flex justify-between mt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition duration-300"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300"
                >
                  ตรวจสอบข้อมูล
                </button>
              </div>
            </div>
          </>
        );
      case 4:
        return (
          <>
            <div className="rounded-box bg-white p-6">
              <h2 className="text-lg font-semibold mb-4">ตรวจสอบและยืนยัน</h2>
              {renderSummary(values)}
              <div className="flex justify-between mt-4">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition duration-300"
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log('Submit button clicked');
                    console.log('Form errors:', errors);
                    console.log('Form touched:', touched);
                    submitForm();
                  }}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300 disabled:bg-red-300"
                >
                  {isSubmitting ? 'กำลังส่งคำขอ...' : 'ยืนยันส่งคำขอ'}
                </button>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6">แบบฟอร์มขอทำ OT</h1>
      <Formik
        initialValues={{
          departmentNames: isManager ? [userData.departmentName] : [],
          employeeIds: [],
          date: formatBangkokTime(getBangkokTime(), 'yyyy-MM-dd'),
          startTime: '',
          endTime: '',
          commonReasons: [],
          reasonDetails: [],
          isAdmin,
          isManager,
        }}
        validationSchema={OvertimeSchema}
        onSubmit={handleOvertimeSubmit}
        validateOnChange={false}
        validateOnBlur={false}
      >
        {({
          values,
          setFieldValue,
          isSubmitting,
          submitForm,
          errors,
          touched,
        }) => (
          <Form className="space-y-4">
            {renderStep(
              values,
              setFieldValue,
              isSubmitting,
              submitForm,
              errors,
              touched,
            )}
          </Form>
        )}
      </Formik>

      {message && (
        <p className="mt-4 text-sm text-center text-gray-600">{message}</p>
      )}
    </div>
  );
};

export default OvertimeRequestForm;
