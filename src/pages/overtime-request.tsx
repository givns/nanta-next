import React, { useEffect, useState, useCallback } from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import liff from '@line/liff';
import SkeletonLoader from '../components/SkeletonLoader';
import axios from 'axios';
import { UserData } from '@/types/user';
import { UserRole } from '@/types/enum';
import LoadingBar from '@/components/LoadingBar';

interface OvertimeRequestPageProps {
  lineUserId: string | null;
}

const OvertimeRequestPage: React.FC<OvertimeRequestPageProps> = ({
  lineUserId,
}) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [message, setMessage] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch User Data
  const fetchUserData = useCallback(async (lineUserId: string) => {
    try {
      const response = await fetch('/api/user-data', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      setUserData(data.user);
      return data.user;
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to fetch user data. Please try again.');
      throw error;
    }
  }, []);

  // Fetch Employees
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

  // Fetch Departments (Admin only)
  const fetchDepartments = useCallback(async () => {
    try {
      const response = await axios.get('/api/departments');
      setDepartments(response.data);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setMessage('ไม่สามารถดึงข้อมูลแผนกได้');
    }
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      try {
        if (liff.isLoggedIn()) {
          if (lineUserId) {
            const user = await fetchUserData(lineUserId);

            setIsManager(user.role === UserRole.MANAGER);
            setIsAdmin(
              [UserRole.ADMIN, UserRole.SUPERADMIN].includes(
                user.role as UserRole,
              ),
            );

            // Update employee fetch with headers
            if (isManager || isAdmin) {
              const employeesResponse = await fetch('/api/employees', {
                headers: { 'x-line-userid': lineUserId },
              });
              const employeesData = await employeesResponse.json();
              setEmployees(employeesData);
            }

            if (isAdmin) {
              const departmentsResponse = await fetch('/api/departments', {
                headers: { 'x-line-userid': lineUserId },
              });
              const departmentsData = await departmentsResponse.json();
              setDepartments(departmentsData);
            }
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

    if (lineUserId) {
      initializeData();
    }
  }, [lineUserId, fetchUserData, isManager, isAdmin]);

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen">
        <h1 className="text-xl mb-6 text-gray-800">Error</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (isLoading || !lineUserId || !userData) {
    return (
      <div className="mt-8">
        <LoadingBar />
      </div>
    );
  }

  return (
    <div className="main-container flex flex-col min-h-screen bg-gray-100 p-4">
      <div className="flex-grow flex flex-col justify-start items-center">
        <div className="w-full max-w-md">
          <OvertimeRequestForm
            lineUserId={lineUserId}
            userData={userData}
            employees={employees}
            departments={departments}
            isManager={isManager}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </div>
  );
};

export default OvertimeRequestPage;
