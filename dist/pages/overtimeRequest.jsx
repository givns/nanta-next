import React, { useState } from 'react';
const OvertimeRequest = () => {
  const [date, setDate] = useState('');
  const [hours, setHours] = useState(0);
  const [reason, setReason] = useState('');
  const handleSubmit = async (event) => {
    event.preventDefault();
    // Submit overtime request logic
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="container bg-white p-6 rounded-lg shadow-lg w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Overtime Request</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="date"
              className="block text-gray-700 font-bold mb-2"
            >
              Date
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="hours"
              className="block text-gray-700 font-bold mb-2"
            >
              Hours
            </label>
            <input
              type="number"
              id="hours"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="reason"
              className="block text-gray-700 font-bold mb-2"
            >
              Reason
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Submit
          </button>
        </form>
      </div>
    </div>
  );
};
export default OvertimeRequest;
