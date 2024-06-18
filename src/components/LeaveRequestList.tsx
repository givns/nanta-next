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
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-2xl p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h1 className="text-xl font-medium text-gray-900 dark:text-white mb-4">
          Leave Requests
        </h1>
        <ul className="space-y-4">
          {leaveRequests.map((request) => (
            <li
              key={request.id}
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 dark:bg-gray-700 dark:border-gray-600"
            >
              <p>
                <strong>ประเภทการลา:</strong> {request.leaveType}
              </p>
              <p>
                <strong>เหตุผล:</strong> {request.reason}
              </p>
              <p>
                <strong>วันที่เริ่มต้น:</strong> {request.startDate}
              </p>
              <p>
                <strong>วันที่สิ้นสุด:</strong> {request.endDate}
              </p>
              <p>
                <strong>สถานะ:</strong> {request.status}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default LeaveRequestList;
