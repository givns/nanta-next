import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface LeaveRequest {
  _id: string;
  userId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
}

interface OvertimeRequest {
  _id: string;
  userId: string;
  date: string;
  hours: number;
  reason: string;
  status: string;
}

const ApprovalDashboard: React.FC = () => {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);

  useEffect(() => {
    // Fetch leave requests
    axios.get('/api/requests/leave')
      .then(response => setLeaveRequests(response.data.data))
      .catch(error => console.error('Error fetching leave requests', error));

    // Fetch overtime requests
    axios.get('/api/requests/overtime')
      .then(response => setOvertimeRequests(response.data.data))
      .catch(error => console.error('Error fetching overtime requests', error));
  }, []);

  const handleApprove = async (id: string, type: 'leave' | 'overtime') => {
    try {
      const url = `/api/approvals/${type}/${id}/approve`;
      await axios.post(url);
      alert(`${type === 'leave' ? 'Leave' : 'Overtime'} request approved successfully`);
      // Refresh the list of requests
      if (type === 'leave') {
        setLeaveRequests(leaveRequests.filter(request => request._id !== id));
      } else {
        setOvertimeRequests(overtimeRequests.filter(request => request._id !== id));
      }
    } catch (error) {
      alert(`Failed to approve ${type} request`);
    }
  };

  const handleDeny = async (id: string, type: 'leave' | 'overtime') => {
    try {
      const url = `/api/approvals/${type}/${id}/deny`;
      await axios.post(url);
      alert(`${type === 'leave' ? 'Leave' : 'Overtime'} request denied successfully`);
      // Refresh the list of requests
      if (type === 'leave') {
        setLeaveRequests(leaveRequests.filter(request => request._id !== id));
      } else {
        setOvertimeRequests(overtimeRequests.filter(request => request._id !== id));
      }
    } catch (error) {
      alert(`Failed to deny ${type} request`);
    }
  };

  return (
    <div>
      <h2 className="text-xl mb-4">Approval Dashboard</h2>
      <div className="mt-8">
        <h3 className="text-lg mb-4">Leave Requests</h3>
        <ul>
          {leaveRequests.map(request => (
            <li key={request._id} className="border p-2 mb-2">
              <p>From: {request.startDate} To: {request.endDate}</p>
              <p>Reason: {request.reason}</p>
              <p>Status: {request.status}</p>
              {request.status === 'pending' && (
                <div>
                  <button
                    onClick={() => handleApprove(request._id, 'leave')}
                    className="bg-green-500 text-white p-2 mr-2 rounded"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(request._id, 'leave')}
                    className="bg-red-500 text-white p-2 rounded"
                  >
                    Deny
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        <h3 className="text-lg mb-4">Overtime Requests</h3>
        <ul>
          {overtimeRequests.map(request => (
            <li key={request._id} className="border p-2 mb-2">
              <p>Date: {request.date}</p>
              <p>Hours: {request.hours}</p>
              <p>Reason: {request.reason}</p>
              <p>Status: {request.status}</p>
              {request.status === 'pending' && (
                <div>
                  <button
                    onClick={() => handleApprove(request._id, 'overtime')}
                    className="bg-green-500 text-white p-2 mr-2 rounded"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(request._id, 'overtime')}
                    className="bg-red-500 text-white p-2 rounded"
                  >
                    Deny
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ApprovalDashboard;