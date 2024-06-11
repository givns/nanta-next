import React, { useEffect, useState } from 'react';

interface LeaveRequest {
  id: string;
  userId: string;
  leaveType: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
}

const LeaveRequestList = () => {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaveRequests = async () => {
      try {
        const response = await fetch('/api/getLeaveRequests');
        const data = await response.json();
        setLeaveRequests(data);
      } catch (error) {
        setError('Error fetching leave requests');
        console.error(error);
      }
    };

    fetchLeaveRequests();
  }, []);

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h1>Leave Requests</h1>
      <ul>
        {leaveRequests.map((request) => (
          <li key={request.id}>
            {request.reason} ({request.status})
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LeaveRequestList;
