import React, { useState } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
  endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
  reason: Yup.string().required('กรุณาระบุเหตุผล'),
  isManager: Yup.boolean(),
});

const ThaiDatePicker = ({ field, form }: any) => {
  const [date, setDate] = React.useState<Date | undefined>(
    field.value ? new Date(field.value) : undefined,
  );

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

  const formatThaiDate = (date: Date | undefined) => {
    if (!date) return 'เลือกวันที่';
    const day = date.getDate();
    const month = thaiMonths[date.getMonth()];
    const year = date.getFullYear() + 543; // Convert to Buddhist Era
    return `${day} ${month} ${year}`;
  };

  const handleSelect = (newDate: Date | undefined) => {
    setDate(newDate);
    form.setFieldValue(field.name, newDate);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatThaiDate(date)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-popover" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          locale={th}
          formatters={{
            formatCaption: (date, options) => {
              const month = thaiMonths[date.getMonth()];
              const year = date.getFullYear() + 543;
              return `${month} ${year}`;
            },
          }}
          initialFocus
          className="max-h-[300px] overflow-y-auto"
        />
      </PopoverContent>
    </Popover>
  );
};

const TimePickerField = ({ field, form }: any) => {
  const [time, setTime] = React.useState(field.value);

  const handleTimeChange = (newTime: string) => {
    setTime(newTime);
    form.setFieldValue(field.name, newTime);
  };

  return (
    <Select value={time} onValueChange={handleTimeChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="เลือกเวลา" />
      </SelectTrigger>
      <SelectContent className="max-h-[300px] overflow-y-auto">
        {Array.from({ length: 24 * 4 }, (_, i) => {
          const hours = Math.floor(i / 4);
          const minutes = (i % 4) * 15;
          const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          return (
            <SelectItem key={i} value={timeString}>
              {timeString}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

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
                <Field name="date" component={ThaiDatePicker} />
                <ErrorMessage
                  name="date"
                  component="div"
                  className="text-red-500 text-sm"
                />
              </div>
              <div>
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
              <div>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  rows={3}
                />
                <ErrorMessage
                  name="reason"
                  component="div"
                  className="text-red-500 text-sm"
                />
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอทำงานล่วงเวลา'}
              </Button>
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
