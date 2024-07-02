import React, { useState, useEffect } from 'react';
import CheckInOutForm from '../components/CheckInOutForm';
import { UserData, AttendanceStatus } from '../types/user';
import axios from 'axios';

const CheckInRouter: React.FC = () => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Fetch user data from your API
        const userResponse = await axios.get('/api/user');
        setUserData(userResponse.data);

        // Fetch attendance status
        const statusResponse = await axios.get('/api/check-status', {
          params: { employeeId: userResponse.data.employeeId },
        });
        setAttendanceStatus(statusResponse.data);
      } catch (error) {
        console.error('Error fetching user data or attendance status:', error);
        setMessage('Failed to load user data or attendance status');
      }
    };

    fetchUserData();
  }, []);

  if (!userData || !attendanceStatus) {
    return <div>Loading...</div>;
  }

  return (
    <div className="main-container flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          {attendanceStatus.isCheckingIn
            ? 'ระบบบันทึกเวลาเข้างาน'
            : 'ระบบบันทึกเวลาออกงาน'}
        </h1>
        <div className="text-3xl font-bold text-center mb-8 text-black-950">
          {new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}
        </div>
        {message && (
          <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
            {message}
          </div>
        )}
        <CheckInOutForm userData={userData} />
      </div>
    </div>
  );
};

export default CheckInRouter;
