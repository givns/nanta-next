import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
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

interface FormValues {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
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
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<FormValues | null>(null);

  const isManager = useMemo(() => {
    return (
      userData?.role &&
      [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN].includes(
        userData.role as UserRole,
      )
    );
  }, [userData]);

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
    employeeId: Yup.string().required('กรุณาเลือกพนักงาน'),
    date: Yup.date().required('กรุณาเลือกวันที่'),
    startTime: Yup.string().required('กรุณาระบุเวลาเริ่มต้น'),
    endTime: Yup.string().required('กรุณาระบุเวลาสิ้นสุด'),
    reason: Yup.string().required('กรุณาระบุเหตุผล'),
  });

  const handleOvertimeSubmit = async (values: FormValues) => {
    try {
      setSummaryData(values);
      setShowSummary(true);
    } catch (error) {
      console.error('Error preparing summary:', error);
      setMessage('ไม่สามารถสร้างสรุปคำขอทำงานล่วงเวลาได้');
    }
  };

  const handleConfirmSubmit = async () => {
    if (!summaryData) return;

    try {
      const endpoint = '/api/overtime/request';
      const requestData = {
        lineUserId,
        ...summaryData,
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

  if (isLoading) {
    return <SkeletonLoader />;
  }

  if (showSummary && summaryData) {
    return (
      <OvertimeSummary
        data={{ ...summaryData, employees: [] }}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSummary(false)}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
        <div className="relative py-3 sm:max-w-xl sm:mx-auto">
          <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
            <h1 className="text-2xl font-semibold mb-6 text-center">
              คำขอทำงานล่วงเวลา
            </h1>

            {existingRequests.length > 0 && (
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
                employeeId: userData?.employeeId || '',
                date: formatBangkokTime(getBangkokTime(), 'yyyy-MM-dd'),
                startTime: userData?.shiftCode
                  ? formatTime(userData.shiftCode.split('-')[1])
                  : '',
                endTime: '',
                reason: '',
              }}
              validationSchema={OvertimeSchema}
              onSubmit={handleOvertimeSubmit}
            >
              {({ errors, touched, isSubmitting }) => (
                <Form className="space-y-4">
                  {isManager && (
                    <div>
                      <Label htmlFor="employeeId">พนักงาน</Label>
                      <Field as={Select} id="employeeId" name="employeeId">
                        <option value="">เลือกพนักงาน</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage
                        name="employeeId"
                        component="div"
                        className="text-red-500 text-sm"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="date">วันที่</Label>
                    <Field as={Input} type="date" id="date" name="date" />
                    <ErrorMessage
                      name="date"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="startTime">เวลาเริ่มต้น</Label>
                    <Field name="startTime" component={TimePickerField} />
                    <ErrorMessage
                      name="startTime"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">เวลาสิ้นสุด</Label>
                    <Field name="endTime" component={TimePickerField} />
                    <ErrorMessage
                      name="endTime"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reason">เหตุผล</Label>
                    <Field as={Textarea} id="reason" name="reason" rows={3} />
                    <ErrorMessage
                      name="reason"
                      component="div"
                      className="text-red-500 text-sm"
                    />
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
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default OvertimeRequestForm;
