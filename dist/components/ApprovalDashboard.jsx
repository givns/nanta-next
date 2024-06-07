import React, { useEffect, useState } from 'react';
const ApprovalDashboard = () => {
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [overtimeRequests, setOvertimeRequests] = useState([]);
    const [message, setMessage] = useState('');
    useEffect(() => {
        const fetchRequests = async () => {
            try {
                const leaveResponse = await fetch('/api/getLeaveRequests');
                const leaveData = await leaveResponse.json();
                setLeaveRequests(leaveData.requests);
                const overtimeResponse = await fetch('/api/getOvertimeRequests');
                const overtimeData = await overtimeResponse.json();
                setOvertimeRequests(overtimeData.requests);
            }
            catch (error) {
                console.error('Error fetching requests:', error);
            }
        };
        fetchRequests();
    }, []);
    const handleAction = async (requestId, type, action) => {
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
                const updatedLeaveRequests = leaveRequests.filter(request => request._id !== requestId);
                setLeaveRequests(updatedLeaveRequests);
                const updatedOvertimeRequests = overtimeRequests.filter(request => request._id !== requestId);
                setOvertimeRequests(updatedOvertimeRequests);
            }
            else {
                setMessage('Failed to process the request');
            }
        }
        catch (error) {
            console.error('Error processing request:', error);
            setMessage('Error occurred while processing the request');
        }
    };
    return (<div>
      <h1>Approval Dashboard</h1>
      {message && <p>{message}</p>}
      <h2>Leave Requests</h2>
      {leaveRequests.length === 0 ? (<p>No leave requests</p>) : (leaveRequests.map(request => (<div key={request._id}>
            <p>{request.reason}</p>
            <button onClick={() => handleAction(request._id, 'leave', 'approve')}>Approve</button>
            <button onClick={() => handleAction(request._id, 'leave', 'deny')}>Deny</button>
          </div>)))}
      <h2>Overtime Requests</h2>
      {overtimeRequests.length === 0 ? (<p>No overtime requests</p>) : (overtimeRequests.map(request => (<div key={request._id}>
            <p>{request.reason}</p>
            <button onClick={() => handleAction(request._id, 'overtime', 'approve')}>Approve</button>
            <button onClick={() => handleAction(request._id, 'overtime', 'deny')}>Deny</button>
          </div>)))}
    </div>);
};
export default ApprovalDashboard;
