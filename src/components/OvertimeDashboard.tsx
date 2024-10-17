import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { OvertimeRequest, User } from '@prisma/client';

interface OvertimeDashboardProps {
  employeeId: string;
  userRole: string;
  userDepartmentId: string;
}

const OvertimeDashboard: React.FC<OvertimeDashboardProps> = ({
  employeeId,
  userRole,
  userDepartmentId,
}) => {
  const [pendingRequests, setPendingRequests] = useState<
    (OvertimeRequest & { user: User })[]
  >([]);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchPendingRequests();
  }, [currentPage, pageSize]);

  const fetchPendingRequests = async () => {
    try {
      const response = await axios.get('/api/overtime/pending', {
        params: {
          userRole,
          departmentId: userDepartmentId,
          page: currentPage,
          pageSize,
        },
      });
      setPendingRequests(response.data.requests);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  };

  const handleBatchApproval = async () => {
    if (selectedRequests.length === 0) return;
    try {
      await axios.post('/api/overtime/batchApprove', {
        requestIds: selectedRequests,
        approverId: employeeId,
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

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Overtime Approval</h1>

      <div className="mb-4 flex justify-between items-center">
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="border rounded p-2 text-sm"
        >
          <option value="10">10 per page</option>
          <option value="25">25 per page</option>
          <option value="50">50 per page</option>
        </select>

        <button
          onClick={handleBatchApproval}
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm"
          disabled={selectedRequests.length === 0}
        >
          Approve ({selectedRequests.length})
        </button>
      </div>

      <div className="space-y-4">
        {pendingRequests.map((request) => (
          <div key={request.id} className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{request.user.name}</span>
              <input
                type="checkbox"
                checked={selectedRequests.includes(request.id)}
                onChange={() => handleSelectRequest(request.id)}
                className="h-5 w-5"
              />
            </div>
            <div className="text-sm text-gray-600">
              <p>Date: {new Date(request.date).toLocaleDateString()}</p>
              <p>
                Time: {request.startTime} - {request.endTime}
              </p>
              <p className="mt-2">Reason: {request.reason}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center items-center space-x-2">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1 border rounded text-sm"
        >
          &lt;
        </button>
        <span className="text-sm">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1 border rounded text-sm"
        >
          &gt;
        </button>
      </div>
    </div>
  );
};

export default OvertimeDashboard;
