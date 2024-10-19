//ApprovalDashboard.tsx
import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Table } from '../components/ui/table';
import axios from 'axios';

interface Request {
  id: string;
  employeeId: string;
  date: string;
  reason?: string;
  hours?: number;
  type?: string;
}

interface ApprovalDashboardProps {
  leaveRequests: Request[];
  overtimeRequests: Request[];
  potentialOvertimes: Request[];
}

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = ({
  leaveRequests,
  overtimeRequests,
  potentialOvertimes,
}) => {
  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const [leaveData, overtimeData, potentialOvertimeData] =
        await Promise.all([
          axios.get('/api/getLeaveRequests'),
          axios.get('/api/getOvertimeRequests'),
          axios.get('/api/getPotentialOvertimes'),
        ]);

      // Assuming you have state setters for these, uncomment and use them
      // setLeaveRequests(leaveData.data);
      // setOvertimeRequests(overtimeData.data);
      // setPotentialOvertimes(potentialOvertimeData.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleAction = async (
    requestId: string,
    type: string,
    action: string,
  ) => {
    try {
      await axios.post('/api/approveRequest', {
        requestId,
        type,
        action,
      });
      fetchRequests(); // Refresh data after action
    } catch (error) {
      console.error('Error handling action:', error);
    }
  };

  const renderTable = (data: Request[], type: string) => {
    const columns = [
      { title: 'Employee ID', dataIndex: 'employeeId', key: 'employeeId' },
      { title: 'Date', dataIndex: 'date', key: 'date' },
      { title: 'Reason', dataIndex: 'reason', key: 'reason' },
      {
        title: 'Action',
        key: 'action',
        dataIndex: 'id',
        render: (id: string, record: Request) => (
          <>
            <Button onClick={() => handleAction(id, type, 'approve')}>
              Approve
            </Button>
            <Button onClick={() => handleAction(id, type, 'deny')}>Deny</Button>
          </>
        ),
      },
    ];

    if (type === 'potentialOvertime') {
      columns.splice(2, 0, {
        title: 'Hours',
        dataIndex: 'hours',
        key: 'hours',
      });
      columns.splice(3, 0, { title: 'Type', dataIndex: 'type', key: 'type' });
    }

    return <Table columns={columns} dataSource={data} />;
  };

  return (
    <div>
      <h2>Leave Requests</h2>
      {renderTable(leaveRequests, 'leave')}
      <h2>Overtime Requests</h2>
      {renderTable(overtimeRequests, 'overtime')}
      <h2>Potential Overtime</h2>
      {renderTable(potentialOvertimes, 'potentialOvertime')}
    </div>
  );
};

export default ApprovalDashboard;
