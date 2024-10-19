import { useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import liff from '@line/liff';
import axios from 'axios';
import ConsolidatedApprovalDashboard from '../components/ConsolidatedApprovalDashboard';
import { UserData } from '@/types/user';
import { UserRole } from '@/types/enum';

interface ApprovalDashboardProps {
  liffId: string;
}

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = ({ liffId }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeLiffAndFetchData = async () => {
      try {
        if (!liffId) {
          throw new Error('LIFF ID is not defined');
        }

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUserId = profile.userId;

        // Fetch user data
        const userResponse = await axios.get<{ user: UserData }>(
          `/api/user-data?lineUserId=${lineUserId}`,
        );
        const fetchedUserData = userResponse.data.user;
        setUserData(fetchedUserData);

        // Check authorization based on user role
        const authorizedRoles = [UserRole.ADMIN, UserRole.SUPERADMIN];
        const isUserAuthorized = authorizedRoles.includes(
          fetchedUserData.role as UserRole,
        );
        setIsAuthorized(isUserAuthorized);

        if (!isUserAuthorized) {
          setError('คุณไม่ได้รับสิทธิการเข้าถึง');
        }
      } catch (err) {
        console.error('Error during initialization or data fetching:', err);
        setError('Failed to initialize LIFF or fetch user data');
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiffAndFetchData();
  }, [liffId]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!isAuthorized) {
    return <div>คุณไม่ได้รับสิทธิการเข้าถึง</div>;
  }

  if (!userData) {
    return <div>ไม่พบข้อมูลผู้ใช้</div>;
  }

  const { employeeId, role, departmentName, lineUserId } = userData;

  if (!lineUserId) {
    return <div>ไม่พบข้อมูลผู้ใช้</div>;
  }

  return (
    <ConsolidatedApprovalDashboard
      userData={{ employeeId, role, departmentName, lineUserId }}
    />
  );
};

export default ApprovalDashboard;
