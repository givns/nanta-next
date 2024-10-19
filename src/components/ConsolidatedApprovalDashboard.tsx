import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ApprovalDashboard from './ApprovalDashboard';

interface ConsolidatedApprovalDashboardProps {
  userData: {
    employeeId: string;
    role: string;
    departmentName: string;
    lineUserId: string;
  };
}

const ConsolidatedApprovalDashboard: React.FC<
  ConsolidatedApprovalDashboardProps
> = ({ userData }) => {
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [overtimeRequests, setOvertimeRequests] = useState([]);
  const [potentialOvertimes, setPotentialOvertimes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [leaveResponse, overtimeResponse, potentialOvertimeResponse] =
          await Promise.all([
            axios.get('/api/getLeaveRequests'),
            axios.get('/api/getOvertimeRequests'),
            axios.get('/api/getPotentialOvertimes'),
          ]);

        console.log('Leave Requests:', leaveResponse.data);
        console.log('Overtime Requests:', overtimeResponse.data);
        console.log('Potential Overtimes:', potentialOvertimeResponse.data);

        setLeaveRequests(leaveResponse.data);
        setOvertimeRequests(overtimeResponse.data);
        setPotentialOvertimes(potentialOvertimeResponse.data);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to fetch approval data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Approval Dashboard</h1>
      <ApprovalDashboard
        leaveRequests={leaveRequests || []}
        overtimeRequests={overtimeRequests || []}
        potentialOvertimes={potentialOvertimes || []}
      />
    </div>
  );
};

export default ConsolidatedApprovalDashboard;
