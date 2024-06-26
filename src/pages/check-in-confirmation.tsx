import { useEffect } from 'react';
import liff from '@line/liff';

const CheckpointConfirmationPage = () => {
  useEffect(() => {
    const timer = setTimeout(() => {
      liff.closeWindow();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="container mx-auto flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">ระบบลงเวลาเสร็จสมบูรณ์</h1>
      <p>ระบบบันทึกการลงเวลาของคุณเรียบร้อยแล้ว</p>
    </div>
  );
};

export default CheckpointConfirmationPage;
