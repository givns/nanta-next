import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { saveData } from '../services/SyncService';

const CheckpointForm: React.FC = () => {
  const [checkpointName, setCheckpointName] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCheckpoint = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = {
        checkpointName,
        location,
        address,
        timestamp: new Date().toISOString(),
      };

      await saveData('checkpoint', data);

      alert('Checkpoint added successfully!');
      router.push('/next-route'); // Adjust the route accordingly
    } catch (error) {
      console.error('Failed to add checkpoint:', error);
      setError('Failed to add checkpoint. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          Add Checkpoint
        </h5>
        <div className="space-y-6">
          <div className="mb-3">
            <label
              htmlFor="checkpointName"
              className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
            >
              Checkpoint Name
            </label>
            <input
              type="text"
              id="checkpointName"
              value={checkpointName}
              onChange={(e) => setCheckpointName(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
              required
            />
          </div>
          <button
            onClick={handleCheckpoint}
            disabled={loading}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          >
            {loading ? 'Adding Checkpoint...' : 'Add Checkpoint'}
          </button>
          {error && <p className="text-danger text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default CheckpointForm;
