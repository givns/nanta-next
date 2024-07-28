import { useState } from 'react';
import { GetServerSideProps } from 'next';

export default function DebugPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (action?: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/debug?employeeId=${employeeId}${action ? `&action=${action}` : ''}`,
      );
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Debug Logs</h1>
      <div className="mb-4">
        <input
          type="text"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          placeholder="Enter Employee ID"
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
          onClick={() => fetchLogs('check-in')}
          className="bg-green-500 text-white px-4 py-2 rounded mr-2"
          disabled={loading}
        >
          Simulate Check-In
        </button>
        <button
          onClick={() => fetchLogs('check-out')}
          className="bg-red-500 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          Simulate Check-Out
        </button>
      </div>
      {loading && <p>Loading...</p>}
      {logs && (
        <div className="whitespace-pre-wrap bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-bold mb-2">Log Output:</h2>
          {JSON.stringify(logs, null, 2)}
        </div>
      )}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Add any server-side logic here if needed
  return { props: {} };
};
