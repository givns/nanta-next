import React, { useEffect, useState } from 'react';
import axios from 'axios';
import GeneralUserMenu from '../components/Menus/GeneralUserMenu';
import AdminUserMenu from '../components/Menus/AdminUserMenu';
import SuperAdminUserMenu from '../components/Menus/SuperAdminUserMenu'; 
import LeaveRequestForm from '../components/Forms/LeaveRequestForm';
import OvertimeRequestForm from '../components/Forms/OvertimeRequestForm';
import ApprovalDashboard from '../components/Dashboard/ApprovalDashboard';

interface User {
  name: string;
  role: string;
}

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

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);

  useEffect(() => {
    // Fetch user data from API
    axios.get('/api/user/me')
      .then(response => setUser(response.data))
      .catch(error => console.error('Error fetching user data', error));

    // Fetch leave requests
    axios.get('/api/requests/leave')
      .then(response => setLeaveRequests(response.data.data))
      .catch(error => console.error('Error fetching leave requests', error));

    // Fetch overtime requests
    axios.get('/api/requests/overtime')
      .then(response => setOvertimeRequests(response.data.data))
      .catch(error => console.error('Error fetching overtime requests', error));
  }, []);

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl mb-4">Welcome, {user.name}</h1>
      <p>Role: {user.role}</p>

      {user.role === 'general' && <GeneralUserMenu />}
      {user.role === 'admin' && <AdminUserMenu />}
      {user.role === 'super-admin' && <SuperAdminUserMenu />}

      {user.role === 'admin' || user.role === 'super-admin' ? (
        <div className="mt-8">
          <ApprovalDashboard />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <h2 className="text-xl mb-4">Submit a Leave Request</h2>
            <LeaveRequestForm />
          </div>

          <div className="mt-8">
            <h2 className="text-xl mb-4">Submit an Overtime Request</h2>
            <OvertimeRequestForm />
          </div>

          <div className="mt-8">
            <h2 className="text-xl mb-4">Your Leave Requests</h2>
            <ul>
              {leaveRequests.map(request => (
                <li key={request._id} className="border p-2 mb-2">
                  <p>From: {request.startDate} To: {request.endDate}</p>
                  <p>Reason: {request.reason}</p>
                  <p>Status: {request.status}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <h2 className="text-xl mb-4">Your Overtime Requests</h2>
            <ul>
              {overtimeRequests.map(request => (
                <li key={request._id} className="border p-2 mb-2">
                  <p>Date: {request.date}</p>
                  <p>Hours: {request.hours}</p>
                  <p>Reason: {request.reason}</p>
                  <p>Status: {request.status}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;