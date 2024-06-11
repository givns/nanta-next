import React from 'react';
const RequestSubmission = () => {
  // Submission confirmation logic here
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="container bg-white p-6 rounded-lg shadow-lg w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Request Submission</h1>
        <p>Your request has been submitted successfully!</p>
        {/* Display any additional submission details */}
      </div>
    </div>
  );
};
export default RequestSubmission;
