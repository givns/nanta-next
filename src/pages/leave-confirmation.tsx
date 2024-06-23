import { useEffect } from 'react';
import liff from '@line/liff';

const LeaveConfirmationPage = () => {
  useEffect(() => {
    const timer = setTimeout(() => {
      liff.closeWindow();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="container mx-auto flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">การส่งคำขอลาเสร็จสมบูรณ์</h1>
      <p>คำขอลาของคุณได้รับการส่งเรียบร้อยแล้ว</p>
    </div>
  );
};

export default LeaveConfirmationPage;
