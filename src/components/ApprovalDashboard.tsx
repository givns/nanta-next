import React, { useEffect, useState } from 'react';

const ApprovalDashboard: React.FC = () => {
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
  const [potentialOvertimes, setPotentialOvertimes] = useState<any[]>([]);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const [leaveResponse, overtimeResponse, potentialOvertimeResponse] =
          await Promise.all([
            fetch('/api/getLeaveRequests'),
            fetch('/api/getOvertimeRequests'),
            fetch('/api/getPotentialOvertimes'),
          ]);

        const leaveData = await leaveResponse.json();
        const overtimeData = await overtimeResponse.json();
        const potentialOvertimeData = await potentialOvertimeResponse.json();

        setLeaveRequests(leaveData.requests);
        setOvertimeRequests(overtimeData.requests);
        setPotentialOvertimes(potentialOvertimeData.requests);
      } catch (error) {
        console.error('Error fetching requests:', error);
      }
    };

    fetchRequests();
  }, []);

  const handleAction = async (
    requestId: string,
    type: string,
    action: string,
  ) => {
    try {
      const response = await fetch('/api/approveRequest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId, type, action }),
      });

      if (response.ok) {
        setMessage(`Request ${action}d successfully`);
        // Refresh the request lists
        if (type === 'leave') {
          setLeaveRequests(
            leaveRequests.filter((request) => request._id !== requestId),
          );
        } else if (type === 'overtime') {
          setOvertimeRequests(
            overtimeRequests.filter((request) => request._id !== requestId),
          );
        } else if (type === 'potentialOvertime') {
          setPotentialOvertimes(
            potentialOvertimes.filter((request) => request._id !== requestId),
          );
        }
      } else {
        setMessage('Failed to process the request');
      }
    } catch (error) {
      console.error('Error processing request:', error);
      setMessage('Error occurred while processing the request');
    }
  };

  return (
    <div>
      <h1>Approval Dashboard</h1>
      {message && <p>{message}</p>}

      <h2>Leave Requests</h2>
      {leaveRequests.length === 0 ? (
        <p>No leave requests</p>
      ) : (
        leaveRequests.map((request) => (
          <div key={request._id}>
            <p>{request.reason}</p>
            <button
              onClick={() => handleAction(request._id, 'leave', 'approve')}
            >
              Approve
            </button>
            <button onClick={() => handleAction(request._id, 'leave', 'deny')}>
              Deny
            </button>
          </div>
        ))
      )}

      <h2>Overtime Requests</h2>
      {overtimeRequests.length === 0 ? (
        <p>No overtime requests</p>
      ) : (
        overtimeRequests.map((request) => (
          <div key={request._id}>
            <p>{request.reason}</p>
            <button
              onClick={() => handleAction(request._id, 'overtime', 'approve')}
            >
              Approve
            </button>
            <button
              onClick={() => handleAction(request._id, 'overtime', 'deny')}
            >
              Deny
            </button>
          </div>
        ))
      )}

      <h2>Potential Overtime</h2>
      {potentialOvertimes.length === 0 ? (
        <p>No potential overtime</p>
      ) : (
        potentialOvertimes.map((overtime) => (
          <div key={overtime._id}>
            <p>Date: {new Date(overtime.date).toLocaleDateString()}</p>
            <p>Hours: {overtime.hours}</p>
            <p>Type: {overtime.type}</p>
            {overtime.periods &&
              overtime.periods.map((period: any, index: number) => (
                <p key={index}>
                  {period.start} - {period.end}
                </p>
              ))}
            <button
              onClick={() =>
                handleAction(overtime._id, 'potentialOvertime', 'approve')
              }
            >
              Approve
            </button>
            <button
              onClick={() =>
                handleAction(overtime._id, 'potentialOvertime', 'deny')
              }
            >
              Deny
            </button>
          </div>
        ))
      )}
    </div>
  );
};

export default ApprovalDashboard;
