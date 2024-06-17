import { useEffect } from 'react';
import liff from '@line/liff';

const LeaveConfirmationPage = () => {
  useEffect(() => {
    // Close the LIFF window after a few seconds
    const timer = setTimeout(() => {
      liff.closeWindow();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-4">
          การส่งคำขอลาเสร็จสมบูรณ์
        </h1>
        <p className="text-center text-gray-900 dark:text-white">
          คำขอลาของคุณได้รับการส่งเรียบร้อยแล้ว
        </p>
      </div>
    </div>
  );
};

export default LeaveConfirmationPage;
