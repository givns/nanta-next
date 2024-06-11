import React from 'react';

const RequestReview: React.FC = () => {
  // Review request data logic here

  const handleEdit = () => {
    // Handle edit request logic
  };

  const handleConfirm = () => {
    // Handle confirm request logic
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="container bg-white p-6 rounded-lg shadow-lg w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Request Review</h1>
        {/* Display request data here */}
        <div className="mb-4">{/* Display request details */}</div>
        <div className="flex justify-around">
          <button
            onClick={handleEdit}
            className="bg-yellow-500 text-white px-4 py-2 rounded"
          >
            Edit
          </button>
          <button
            onClick={handleConfirm}
            className="bg-green-500 text-white px-4 py-2 rounded"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestReview;
