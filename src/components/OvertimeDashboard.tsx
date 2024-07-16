// components/OvertimeDashboard.tsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { OvertimeRequest, User } from '@prisma/client';

interface OvertimeDashboardProps {
  userId: string;
}

const OvertimeDashboard: React.FC<OvertimeDashboardProps> = ({ userId }) => {
  const [pendingRequests, setPendingRequests] = useState<OvertimeRequest[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRequests, setTotalRequests] = useState(0);
  const [sortField, setSortField] = useState<keyof OvertimeRequest>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    fetchPendingRequests();
  }, [page, pageSize, sortField, sortOrder, filterDate]);

  const fetchPendingRequests = async () => {
    try {
      const response = await axios.get('/api/overtime/pending', {
        params: {
          page,
          pageSize,
          sortField,
          sortOrder,
          filterDate,
        },
      });
      setPendingRequests(response.data.requests);
      setTotalRequests(response.data.total);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  };
  const handleBatchApproval = async () => {
    if (selectedRequests.length === 0) return;
    try {
      await axios.post('/api/overtime/batchApprove', {
        requestIds: selectedRequests,
        approverId: userId,
      });
      fetchPendingRequests();
      setSelectedRequests([]);
    } catch (error) {
      console.error('Error approving requests:', error);
    }
  };

  const handleSelectRequest = (requestId: string) => {
    setSelectedRequests((prev) =>
      prev.includes(requestId)
        ? prev.filter((id) => id !== requestId)
        : [...prev, requestId],
    );
  };

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">Overtime Approval Dashboard</h1>
      {/* Add filter and sort controls */}
      <div className="mb-4">
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="mr-2"
        />
        <select
          value={sortField}
          onChange={(e) =>
            setSortField(e.target.value as keyof OvertimeRequest)
          }
          className="mr-2"
        >
          <option value="date">Date</option>
          <option value="startTime">Start Time</option>
          <option value="endTime">End Time</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2 px-4 border-b">Select</th>
            <th className="py-2 px-4 border-b">Employee</th>
            <th className="py-2 px-4 border-b">Date</th>
            <th className="py-2 px-4 border-b">Time</th>
            <th className="py-2 px-4 border-b">Reason</th>
          </tr>
        </thead>
        <tbody>
          {pendingRequests.map((request) => (
            <tr key={request.id}>
              <td className="py-2 px-4 border-b">
                <input
                  type="checkbox"
                  checked={selectedRequests.includes(request.id)}
                  onChange={() => handleSelectRequest(request.id)}
                />
              </td>
              <td className="py-2 px-4 border-b">{request.userId}</td>
              <td className="py-2 px-4 border-b">
                {new Date(request.date).toLocaleDateString()}
              </td>
              <td className="py-2 px-4 border-b">{`${request.startTime} - ${request.endTime}`}</td>
              <td className="py-2 px-4 border-b">{request.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={handleBatchApproval}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
        disabled={selectedRequests.length === 0}
      >
        Approve Selected
      </button>
      {/* Add pagination controls */}
      <div className="mt-4">
        <button
          onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
          disabled={page === 1}
          className="mr-2"
        >
          Previous
        </button>
        <span>
          Page {page} of {Math.ceil(totalRequests / pageSize)}
        </span>
        <button
          onClick={() => setPage((prev) => prev + 1)}
          disabled={page >= Math.ceil(totalRequests / pageSize)}
          className="ml-2"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default OvertimeDashboard;
