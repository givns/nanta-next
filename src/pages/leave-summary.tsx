import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import 'dayjs/locale/th';
import liff from '@line/liff';

const LeaveSummaryPage = () => {
  const router = useRouter();
  const [summaryData, setSummaryData] = useState<any>(null);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const data = sessionStorage.getItem('leaveSummary');
    if (data) {
      console.log('Data retrieved from session storage:', data);
      setSummaryData(JSON.parse(data));
    } else {
      console.log('No data found, redirecting to leave request page.');
      router.push('/leave-request');
    }
  }, [router]);

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

  const calculateFullDayCount = (
    startDate: string,
    endDate: string,
    leaveFormat: string,
  ) => {
    if (leaveFormat === 'ลาครึ่งวัน') {
      return 0.5;
    }
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    let fullDayCount = 0;
    for (
      let date = start;
      date.isBefore(end) || date.isSame(end, 'day');
      date = date.add(1, 'day')
    ) {
      if (date.day() !== 0) {
        // Exclude Sundays
        fullDayCount += 1;
      }
    }
    return fullDayCount;
  };

  const handleSubmit = async () => {
    setLoading(true); // Set loading to true when submitting the form
    try {
      const fullDayCount = calculateFullDayCount(
        summaryData.startDate,
        summaryData.endDate,
        summaryData.leaveFormat,
      );

      const leaveData = {
        ...summaryData,
        userId: lineUserId, // Include lineUserId in the data
        status: 'Pending',
        fullDayCount,
      };

      console.log('Submitting leaveData:', leaveData);

      const response = await axios.post('/api/leaveRequest/create', leaveData);
      if (response.status === 201) {
        console.log('Leave request submitted successfully');
        router.push('/leave-confirmation');
      } else {
        console.error('Error:', response.data.error);
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      console.error('Error:', error.response?.data?.error || error.message);
      alert('Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false); // Set loading to false when the submission is complete
    }
  };

  if (!summaryData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <div className="mb-1 text-base font-medium dark:text-white">
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: '100%' }}
            ></div>
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-4">ขอวันลา</h1>
        <div className="mb-4">
          <p className="mb-2">
            <strong>ประเภทการลา:</strong> {summaryData.leaveType}
          </p>
          <p className="mb-2">
            <strong>รูปแบบการลา:</strong> {summaryData.leaveFormat}
          </p>
          <p className="mb-2">
            <strong>จำนวนวันลา:</strong>{' '}
            {calculateFullDayCount(
              summaryData.startDate,
              summaryData.endDate,
              summaryData.leaveFormat,
            )}
          </p>
          <p className="mb-2">
            <strong>วันที่เริ่มต้น:</strong>{' '}
            {dayjs(summaryData.startDate).locale('th').format('D MMM YYYY')}
          </p>
          {summaryData.leaveFormat === 'ลาเต็มวัน' && (
            <p className="mb-2">
              <strong>วันที่สิ้นสุด:</strong>{' '}
              {dayjs(summaryData.endDate).locale('th').format('D MMM YYYY')}
            </p>
          )}
          <p className="mb-2">
            <strong>เหตุผล:</strong> {summaryData.reason}
          </p>
        </div>
        <div className="button-container flex justify-between mt-4">
          <button
            type="button"
            className="py-2.5 px-5 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
            onClick={() => router.push('/leave-request')}
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5"
            onClick={handleSubmit}
          >
            ยืนยัน
          </button>
        </div>
        {loading && (
          <div className="loading-spinner flex justify-center mt-4">
            {/* Add your loading spinner component or HTML here */}
            Loading...
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveSummaryPage;
