import React, { useEffect, useState } from 'react';

interface OvertimeRequest {
  id: string;
  userId: string;
  date: string;
  hours: number;
  reason: string;
  status: string;
}

const OvertimeRequestList = () => {
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOvertimeRequests = async () => {
      try {
        const response = await fetch('/api/getOvertimeRequests');
        const data = await response.json();
        setOvertimeRequests(data);
      } catch (error) {
        setError('Error fetching overtime requests');
        console.error(error);
      }
    };

    fetchOvertimeRequests();
  }, []);

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h1>Overtime Requests</h1>
      <ul>
        {overtimeRequests.map((request) => (
          <li key={request.id}>
            {request.reason} ({request.status})
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OvertimeRequestList;