// components/OvertimeDashboard.tsx

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
          pageSize: pageSize,
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

  const handlePageSizeChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setPageSize(Number(event.target.value));
    setCurrentPage(1); // Reset to first page when changing page size
  };

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">Overtime Approval Dashboard</h1>

      <div className="mb-4">
        <label htmlFor="pageSize" className="mr-2">
          Items per page:
        </label>
        <select
          id="pageSize"
          value={pageSize}
          onChange={handlePageSizeChange}
          className="border rounded p-1"
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </div>

      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2 px-4 border-b">Select</th>
            <th className="py-2 px-4 border-b">Employee</th>
            <th className="py-2 px-4 border-b">Employee Name</th>
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
              <td className="py-2 px-4 border-b">{request.employeeId}</td>
              <td className="py-2 px-4 border-b">{request.user.name}</td>
              <td className="py-2 px-4 border-b">
                {new Date(request.date).toLocaleDateString()}
              </td>
              <td className="py-2 px-4 border-b">{`${request.startTime} - ${request.endTime}`}</td>
              <td className="py-2 px-4 border-b">{request.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-between items-center">
        <button
          onClick={handleBatchApproval}
          className="bg-blue-500 text-white px-4 py-2 rounded"
          disabled={selectedRequests.length === 0}
        >
          Approve Selected
        </button>

        <div>
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="mr-2 px-2 py-1 border rounded"
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="ml-2 px-2 py-1 border rounded"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default OvertimeDashboard;
