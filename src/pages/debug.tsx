// pages/debug.tsx

import { useState } from 'react';
import axios from 'axios';

export default function DebugPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [logs, setLogs] = useState(null);
  const [checkInDebug, setCheckInDebug] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLogs = async (action?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/debug-logs`, {
        params: { employeeId, action },
      });
      setLogs(response.data);
    } catch (err: any) {
      console.error('Error fetching logs:', err);
      setError(err.response?.data?.message || 'An error occurred');
    }
    setLoading(false);
  };

  const fetchCheckInDebug = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/debug-check-in`, {
        params: { employeeId, date },
      });
      setCheckInDebug(response.data);
    } catch (err: any) {
      console.error('Error fetching check-in debug:', err);
      setError(err.response?.data?.message || 'An error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Debug Page</h1>
      <div className="mb-4">
        <input
          type="text"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Enter Employee ID"
          className="border p-2 mr-2"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border p-2 mr-2"
        />
        <button
          onClick={() => fetchLogs()}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
          disabled={loading}
        >
          Fetch Logs
        </button>
        <button
          onClick={fetchCheckInDebug}
          className="bg-green-500 text-white px-4 py-2 rounded mr-2"
          disabled={loading}
        >
          Debug Check-In
        </button>
      </div>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {logs && (
        <div className="whitespace-pre-wrap bg-gray-100 p-4 rounded mb-4">
          <h2 className="text-xl font-bold mb-2">Log Output:</h2>
          {JSON.stringify(logs, null, 2)}
        </div>
      )}
      {checkInDebug && (
        <div className="whitespace-pre-wrap bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-bold mb-2">Check-In Debug Output:</h2>
          {JSON.stringify(checkInDebug, null, 2)}
        </div>
      )}
    </div>
  );
}
