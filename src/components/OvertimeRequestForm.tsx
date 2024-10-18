import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { UserRole } from '@/types/enum';
import { UserData } from '@/types/user';
import liff from '@line/liff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import TimePickerField from './TimePickerField';
import OvertimeSummary from './OvertimeSummary';
import ErrorBoundary from './ErrorBoundary';
import SkeletonLoader from './SkeletonLoader';
import {
  formatTime,
  getBangkokTime,
  formatBangkokTime,
} from '../utils/dateUtils';

interface OvertimeRequestFormProps {
  liff: typeof liff;
  lineUserId: string;
}

interface SummaryData {
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  employees: Array<{
    employeeId: string;
    name: string;
    isDayOff: boolean;
    duration: number;
  }>;
}

interface FormValues {
  employeeIds: string[];
  startTime: string;
  endTime: string;
  reason: string;
  isManager: boolean;
}

const OvertimeRequestForm: React.FC<OvertimeRequestFormProps> = ({
  liff,
  lineUserId,
}) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [existingRequests, setExistingRequests] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [newRequestDate, setNewRequestDate] = useState(
    formatBangkokTime(getBangkokTime(), 'yyyy-MM-dd'),
  );
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  const isManager = useMemo(() => {
    return (
      userData?.role &&
      [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN].includes(
        userData.role as UserRole,
      )
    );
  }, [userData]);
  console.log('userData', userData);

  const fetchUserData = useCallback(async (lineUserId: string) => {
    try {
      const response = await axios.get(
        `/api/user-data?lineUserId=${lineUserId}`,
      );
      setUserData(response.data.user);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setMessage('ไม่สามารถดึงข้อมูลผู้ใช้ได้');
    }
  }, []);

  const fetchExistingRequests = useCallback(async (lineUserId: string) => {
    try {
      const response = await axios.get(
        `/api/overtime/existing-requests?lineUserId=${lineUserId}`,
      );
      setExistingRequests(response.data);
    } catch (error) {
      console.error('Error fetching existing requests:', error);
      setMessage('ไม่สามารถดึงข้อมูลคำขอที่มีอยู่ได้');
    }
  }, []);

  const fetchEmployees = useCallback(async (lineUserId: string) => {
    try {
      const response = await axios.get('/api/employees', {
        headers: { 'x-line-userid': lineUserId },
      });
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setMessage('ไม่สามารถดึงข้อมูลพนักงานได้');
    }
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      try {
        if (liff.isLoggedIn()) {
          await fetchUserData(lineUserId);
          await fetchExistingRequests(lineUserId);
          if (isManager) {
            await fetchEmployees(lineUserId);
          }
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('Initialization failed', error);
        setMessage('ไม่สามารถเชื่อมต่อกับระบบได้');
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [
    liff,
    isManager,
    lineUserId,
    fetchUserData,
    fetchExistingRequests,
    fetchEmployees,
  ]);

  const OvertimeSchema = Yup.object().shape({
    employeeIds: Yup.array()
      .of(Yup.string())
      .test(
        'is-employee-selected',
        'เลือกพนักงานอย่างน้อย 1 คน',
        function (value) {
          const { isManager } = this.parent;
          return isManager ? value && value.length > 0 : true;
        },
      ),
    startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
    endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
    reason: Yup.string().required('กรุณาระบุเหตุผล'),
    isManager: Yup.boolean(),
  });

  const handleOvertimeSubmit = async (values: any) => {
    try {
      const selectedEmployees = isManager
        ? employees.filter((emp) => values.employeeIds.includes(emp.id))
        : [{ id: userData?.employeeId, name: userData?.name }];

      const newSummaryData: SummaryData = {
        date: newRequestDate,
        startTime: values.startTime,
        endTime: values.endTime,
        reason: values.reason,
        employees: selectedEmployees.map((emp) => ({
          employeeId: emp.id,
          name: emp.name,
          isDayOff: false, // You might want to fetch this information
          duration: calculateDuration(values.startTime, values.endTime),
        })),
      };

      setSummaryData(newSummaryData);
      setShowSummary(true);
    } catch (error) {
      console.error('Error preparing summary:', error);
      setMessage('ไม่สามารถสร้างสรุปคำขอทำงานล่วงเวลาได้');
    }
  };

  const handleConfirmSubmit = async () => {
    if (!summaryData) return;

    try {
      const endpoint = isManager
        ? '/api/overtime/create-manager-request'
        : '/api/overtime/request';

      let requestData = isManager
        ? {
            lineUserId,
            employeeIds: summaryData.employees.map((emp) => emp.employeeId),
            date: summaryData.date,
            startTime: summaryData.startTime,
            endTime: summaryData.endTime,
            reason: summaryData.reason,
          }
        : {
            lineUserId,
            employeeId: userData?.employeeId,
            date: summaryData.date,
            startTime: summaryData.startTime,
            endTime: summaryData.endTime,
            reason: summaryData.reason,
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

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    const diff = end.getTime() - start.getTime();
    return Math.round((diff / (1000 * 60 * 60)) * 100) / 100; // Convert to hours with 2 decimal places
  };

  if (isLoading) {
    return <SkeletonLoader />;
  }

  if (showSummary && summaryData) {
    return (
      <OvertimeSummary
        data={summaryData}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSummary(false)}
      />
    );
  }

  return (
    <ErrorBoundary>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>
            {isManager ? 'สร้างคำขอทำงานล่วงเวลา' : 'คำขอทำงานล่วงเวลา'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isManager && existingRequests.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">คำขอที่มีอยู่</h3>
              <ul className="space-y-2">
                {existingRequests.map((request) => (
                  <li key={request.id} className="border p-2 rounded">
                    <div>
                      {format(parseISO(request.date), 'dd/MM/yyyy')} -{' '}
                      {request.startTime} to {request.endTime}
                    </div>
                    <div className="text-sm text-gray-500">
                      สถานะ:{' '}
                      {request.status === 'pending'
                        ? 'รอการอนุมัติ'
                        : request.status === 'approved'
                          ? 'อนุมัติแล้ว'
                          : 'ปฏิเสธแล้ว'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Formik<FormValues>
            initialValues={{
              employeeIds: [],
              startTime: userData?.shiftCode
                ? formatTime(userData.shiftCode.split('-')[1])
                : '',
              endTime: '',
              reason: '',
              isManager: false, // Provide a default value for isManager
            }}
            validationSchema={OvertimeSchema}
            onSubmit={handleOvertimeSubmit}
          >
            {({ values, errors, touched, setFieldValue, isSubmitting }) => (
              <Form className="space-y-4">
                {isManager && (
                  <div>
                    <Label htmlFor="employeeIds">เลือกพนักงาน</Label>
                    <div className="mt-2 space-y-2">
                      {employees.map((employee) => (
                        <div key={employee.id} className="flex items-center">
                          <Checkbox
                            id={`employee-${employee.id}`}
                            checked={values.employeeIds.includes(employee.id)}
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setFieldValue('employeeIds', [
                                  ...values.employeeIds,
                                  employee.id,
                                ]);
                              } else {
                                setFieldValue(
                                  'employeeIds',
                                  values.employeeIds.filter(
                                    (id) => id !== employee.id,
                                  ),
                                );
                              }
                            }}
                          />
                          <Label
                            htmlFor={`employee-${employee.id}`}
                            className="ml-2"
                          >
                            {employee.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {errors.employeeIds && touched.employeeIds && (
                      <div className="text-red-500 text-sm mt-1">
                        {errors.employeeIds}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <Label htmlFor="date">วันที่</Label>
                  <Input
                    type="date"
                    id="date"
                    name="date"
                    value={newRequestDate}
                    onChange={(e) => setNewRequestDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="startTime">เวลาเริ่มต้น</Label>
                  <Field
                    name="startTime"
                    component={TimePickerField}
                    className="mt-1"
                  />
                  {errors.startTime && touched.startTime && (
                    <div className="text-red-500 text-sm mt-1">
                      {errors.startTime}
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="endTime">เวลาสิ้นสุด</Label>
                  <Field
                    name="endTime"
                    component={TimePickerField}
                    className="mt-1"
                  />
                  {errors.endTime && touched.endTime && (
                    <div className="text-red-500 text-sm mt-1">
                      {errors.endTime}
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="reason">เหตุผล</Label>
                  <Field
                    as={Textarea}
                    id="reason"
                    name="reason"
                    className="mt-1"
                    rows={3}
                  />
                  {errors.reason && touched.reason && (
                    <div className="text-red-500 text-sm mt-1">
                      {errors.reason}
                    </div>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? 'กำลังสร้างสรุป...' : 'สร้างสรุปคำขอ'}
                </Button>
              </Form>
            )}
          </Formik>

          {message && (
            <Alert className="mt-4">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </ErrorBoundary>
  );
};

export default OvertimeRequestForm;
