import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import dayjs from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import 'dayjs/locale/th';
import { calculateFullDayCount } from '../lib/holidayUtils';

dayjs.extend(buddhistEra);
dayjs.locale('th');

interface SummaryData {
  leaveType: string;
  leaveFormat: string;
  startDate: string;
  endDate?: string;
  reason: string;
  lineUserId: string | null;
  resubmitted: boolean;
  fullDayCount: number;
  useOvertimeHours?: string;
  userShift: string;
}

const LeaveSummaryPage: React.FC = () => {
  const router = useRouter();
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaveDays, setLeaveDays] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const data = sessionStorage.getItem('leaveSummary');
      if (data) {
        try {
          const parsedData = JSON.parse(data) as SummaryData;
          setSummaryData(parsedData);

          // Ensure dates are valid
          if (!dayjs(parsedData.startDate).isValid()) {
            throw new Error('Invalid start date');
          }
          if (parsedData.endDate && !dayjs(parsedData.endDate).isValid()) {
            throw new Error('Invalid end date');
          }

          const days = await calculateFullDayCount(
            parsedData.startDate,
            parsedData.endDate || parsedData.startDate,
            parsedData.leaveFormat,
            parsedData.userShift,
          );
          setLeaveDays(days);
        } catch (error) {
          console.error('Error processing leave data:', error);
          router.push('/leave-request');
        }
      } else {
        router.push('/leave-request');
      }
    };

    fetchData();
  }, [router]);

  const handleSubmit = async () => {
    if (!summaryData) return;

    setLoading(true);
    try {
      // Format dates for API
      const formattedStartDate = dayjs(summaryData.startDate).format(
        'YYYY-MM-DD',
      );
      const formattedEndDate =
        summaryData.leaveFormat === 'ลาครึ่งวัน'
          ? formattedStartDate
          : dayjs(summaryData.endDate).format('YYYY-MM-DD');

      const leaveData = {
        ...summaryData,
        fullDayCount: leaveDays,
        useOvertimeHours: summaryData.useOvertimeHours || false,
        startDate: formattedStartDate,
        endDate: formattedEndDate,
      };

      console.log('Submitting leaveData:', leaveData);
      const response = await axios.post('/api/admin/leaves/create', leaveData);

      if (response.status === 201) {
        console.log('Leave request submitted successfully');
        sessionStorage.removeItem('leaveSummary');
        router.push('/leave-confirmation');
      } else {
        throw new Error(response.data.error || 'Unknown error occurred');
      }
    } catch (error: any) {
      console.error('Error submitting leave request:', error);
      alert(
        error.response?.data?.error || error.message || 'An error occurred',
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return dayjs(date).format('D MMMM BBBB'); // BBBB for Buddhist year
  };

  if (!summaryData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white border rounded-box p-6 mb-4 shadow-sm">
          <h1 className="text-2xl font-bold mb-6">รายละเอียดการลา</h1>
          <div className="space-y-4">
            <div>
              <p className="text-gray-600">ประเภทการลา</p>
              <p className="font-medium">{summaryData.leaveType}</p>
            </div>
            <div>
              <p className="text-gray-600">รูปแบบการลา</p>
              <p className="font-medium">{summaryData.leaveFormat}</p>
            </div>
            <div>
              <p className="text-gray-600">จำนวนวันลา</p>
              <p className="font-medium">
                {leaveDays !== null ? leaveDays : 'กำลังคำนวณ...'}
              </p>
            </div>
            <div>
              <p className="text-gray-600">วันที่เริ่มต้น</p>
              <p className="font-medium">{formatDate(summaryData.startDate)}</p>
            </div>
            {summaryData.leaveFormat === 'ลาเต็มวัน' && summaryData.endDate && (
              <div>
                <p className="text-gray-600">วันที่สิ้นสุด</p>
                <p className="font-medium">{formatDate(summaryData.endDate)}</p>
              </div>
            )}
            <div>
              <p className="text-gray-600">เหตุผล</p>
              <p className="font-medium">{summaryData.reason}</p>
            </div>
          </div>
          <div className="flex justify-between mt-8">
            <button
              type="button"
              className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
              onClick={() => router.push('/leave-request')}
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              className="px-6 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-400"
              onClick={handleSubmit}
              disabled={loading || leaveDays === null}
            >
              {loading ? 'กำลังส่งคำขอ...' : 'ยืนยัน'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaveSummaryPage;
