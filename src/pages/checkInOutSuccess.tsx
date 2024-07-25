// pages/checkInOutSuccess.tsx

import { useEffect } from 'react';
import liff from '@line/liff';

const CheckInOutSuccess: React.FC = () => {
  useEffect(() => {
    const closeLiffWindow = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });

        setTimeout(() => {
          liff.closeWindow();
        }, 2000); // Close the window after 3 seconds
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };

    closeLiffWindow();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-4 text-green-600">
          ลงเวลาเข้างาน/ลงเวลาออกงาน สำเร็จ
        </h1>
        <p className="text-gray-600 mb-4">
          ระบบได้บันทึกการทำรายงานของคุณเรียบร้อยแล้ว
        </p>
        <p className="text-gray-500">
          ระบบจะกลับเข้าสู่ Line หลังจาก 2 วินาที...
        </p>
      </div>
    </div>
  );
};

export default CheckInOutSuccess;
