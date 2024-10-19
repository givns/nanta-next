import React, { useEffect, useState, useMemo } from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import liff from '@line/liff';
import SkeletonLoader from '../components/SkeletonLoader';
import axios from 'axios';
import { UserData } from '@/types/user';
import { UserRole } from '@/types/enum';
import { set } from 'lodash';

const OvertimeRequestPage: React.FC = () => {
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [message, setMessage] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    const initializeData = async () => {
      try {
        if (liff.isLoggedIn()) {
          if (lineUserId) {
            await fetchUserData(lineUserId);
            setIsManager(
              [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN].includes(
                userData?.role as UserRole,
              ),
            );
          }
          if (isManager && lineUserId) {
            // Add null check for lineUserId
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
  }, [liff, isManager]);

  const fetchUserData = async (lineUserId: string) => {
    try {
      const response = await axios.get(
        `/api/user-data?lineUserId=${lineUserId}`,
      );
      setUserData(response.data.user);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to fetch user data. Please try again.');
    }
  };

  const fetchEmployees = async (lineUserId: string) => {
    try {
      const response = await axios.get('/api/employees', {
        headers: { 'x-line-userid': lineUserId },
      });
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setMessage('ไม่สามารถดึงข้อมูลพนักงานได้');
    }
  };

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-xl mb-6 text-gray-800">Error</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!isLiffReady || !lineUserId || !userData) {
    return <SkeletonLoader />;
  }

  console.log('userData:', userData);
  console.log('isManager:', isManager);
  console.log('employees:', employees);

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-box p-4 mb-4">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {isManager ? 'สร้างคำขอทำงานล่วงเวลา' : 'คำขอทำงานล่วงเวลา'}
          </h2>
          <OvertimeRequestForm
            liff={liff}
            lineUserId={lineUserId}
            userData={userData}
            employees={employees}
            isManager={isManager}
          />
        </div>
      </div>
    </div>
  );
};

export default OvertimeRequestPage;
