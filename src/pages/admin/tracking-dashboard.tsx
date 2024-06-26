import React, { useEffect, useState } from 'react';
import { TrackingSession, User } from '@prisma/client';
import axios from 'axios';
import { format } from 'date-fns';

interface ExtendedTrackingSession extends TrackingSession {
  totalDistance: number;
  user: User;
}

const TrackingDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<ExtendedTrackingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await axios.get('/api/trackingSessions');
        setSessions(response.data);
      } catch (error) {
        console.error('Error fetching tracking sessions:', error);
        setError('Failed to fetch tracking sessions. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Tracking Dashboard</h1>
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2 px-4 border-b">Driver</th>
            <th className="py-2 px-4 border-b">Start Time</th>
            <th className="py-2 px-4 border-b">End Time</th>
            <th className="py-2 px-4 border-b">Total Distance</th>
            <th className="py-2 px-4 border-b">Status</th>
            <th className="py-2 px-4 border-b">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td className="py-2 px-4 border-b">{session.user.name}</td>
              <td className="py-2 px-4 border-b">
                {format(new Date(session.startTime), 'yyyy-MM-dd HH:mm:ss')}
              </td>
              <td className="py-2 px-4 border-b">
                {session.endTime
                  ? format(new Date(session.endTime), 'yyyy-MM-dd HH:mm:ss')
                  : 'Ongoing'}
              </td>
              <td className="py-2 px-4 border-b">
                {session.totalDistance.toFixed(2)} km
              </td>
              <td className="py-2 px-4 border-b">
                {session.endTime ? 'Completed' : 'In Progress'}
              </td>
              <td className="py-2 px-4 border-b">
                <button
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  onClick={() => {
                    /* Implement view details logic */
                  }}
                >
                  View Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TrackingDashboard;
