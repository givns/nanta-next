import { useState, useEffect } from 'react';

export default function ViewLogs() {
  const [logs, setLogs] = useState<string>('');

  useEffect(() => {
    const fetchLogs = async () => {
      const response = await fetch('/api/read-logs');
      const data = await response.json();
      setLogs(data.logs);
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // Refresh logs every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const clearLogs = async () => {
    await fetch('/api/read-logs', { method: 'DELETE' });
    setLogs('');
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Log Viewer</h1>
      <button
        onClick={clearLogs}
        className="mb-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Clear Logs
      </button>
      <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap">{logs}</pre>
    </div>
  );
}
