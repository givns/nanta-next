import React from 'react';
import { useRouter } from 'next/router';

const SuccessPage: React.FC = () => {
  const router = useRouter();
  const { action } = router.query;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white shadow-lg rounded-lg">
        <h1 className="text-3xl font-bold text-green-600 mb-4">Success!</h1>
        <p className="text-xl text-gray-700 mb-6">
          Your {action === 'checkin' ? 'check-in' : 'check-out'} has been
          recorded successfully.
        </p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-300"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};

export default SuccessPage;
