import React, { useEffect, useState } from 'react';
import { getLeaveRequests, approveLeaveRequest } from '../services/api';
const AdminDashboard = () => {
  const [leaveRequests, setLeaveRequests] = useState([]);
  useEffect(() => {
    fetchLeaveRequests();
  }, []);
  const fetchLeaveRequests = async () => {
    try {
      const requests = await getLeaveRequests();
      setLeaveRequests(requests);
    } catch (error) {
      console.error('Error fetching leave requests:', error);
    }
  };
  const handleApprove = async (requestId) => {
    try {
      await approveLeaveRequest(requestId);
      fetchLeaveRequests(); // Refresh the list
    } catch (error) {
      console.error('Error approving leave request:', error);
    }
  };
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <ul>
        {leaveRequests.map((request) => (
          <li key={request._id}>
            {request.details}
            <button onClick={() => handleApprove(request._id)}>Approve</button>
          </li>
        ))}
      </ul>
    </div>
  );
};
export default AdminDashboard;
