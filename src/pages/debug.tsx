// pages/debug.tsx

import { useState } from 'react';
import axios from 'axios';

export default function DebugPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDebugInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/debug-check-in', {
        params: { employeeId, date },
      });
      setDebugInfo(response.data);
    } catch (err: any) {
      console.error('Error fetching debug info:', err);
      setError(err.response?.data?.message || 'An error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Attendance Debug</h1>
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
          onClick={fetchDebugInfo}
          className="bg-blue-500 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          Fetch Debug Info
        </button>
      </div>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {debugInfo && (
        <div className="whitespace-pre-wrap bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-bold mb-2">Debug Information:</h2>
          <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
