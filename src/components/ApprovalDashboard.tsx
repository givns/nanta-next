import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Table } from '../components/ui/table';

interface Request {
  id: string;
  employeeId: string;
  date: string;
  reason?: string;
  hours?: number;
  type?: string;
}

const ApprovalDashboard: React.FC = () => {
  const [leaveRequests, setLeaveRequests] = useState<Request[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<Request[]>([]);
  const [potentialOvertimes, setPotentialOvertimes] = useState<Request[]>([]);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    const [leaveData, overtimeData, potentialOvertimeData] = await Promise.all([
      fetch('/api/getLeaveRequests').then((res) => res.json()),
      fetch('/api/getOvertimeRequests').then((res) => res.json()),
      fetch('/api/getPotentialOvertimes').then((res) => res.json()),
    ]);

    setLeaveRequests(leaveData.requests);
    setOvertimeRequests(overtimeData.requests);
    setPotentialOvertimes(potentialOvertimeData.requests);
  };

  const handleAction = async (
    requestId: string,
    type: string,
    action: string,
  ) => {
    await fetch('/api/approveRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, type, action }),
    });

    fetchRequests();
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
      <h1>Approval Dashboard</h1>
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
