import React, { useState } from 'react';
const LeaveRequest = () => {
    const [leaveType, setLeaveType] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const handleSubmit = async (event) => {
        event.preventDefault();
        // Submit leave request logic
    };
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="container bg-white p-6 rounded-lg shadow-lg w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Leave Request</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="leaveType" className="block text-gray-700 font-bold mb-2">Leave Type</label>
            <input type="text" id="leaveType" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full px-3 py-2 border rounded" required/>
          </div>
          <div className="mb-4">
            <label htmlFor="startDate" className="block text-gray-700 font-bold mb-2">Start Date</label>
            <input type="date" id="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border rounded" required/>
          </div>
          <div className="mb-4">
            <label htmlFor="endDate" className="block text-gray-700 font-bold mb-2">End Date</label>
            <input type="date" id="endDate" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border rounded" required/>
          </div>
          <div className="mb-4">
            <label htmlFor="reason" className="block text-gray-700 font-bold mb-2">Reason</label>
            <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 border rounded" required/>
          </div>
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
            Submit
          </button>
        </form>
      </div>
    </div>);
};
export default LeaveRequest;
