import React, { useState } from 'react';
import liff from '@line/liff';
const OvertimeRequestForm = () => {
    const [date, setDate] = useState('');
    const [hours, setHours] = useState('');
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const profile = await liff.getProfile();
            const userId = profile.userId;
            const response = await fetch('/api/overtimeRequest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId, date, hours, reason }),
            });
            if (response.ok) {
                setMessage('Overtime request submitted successfully!');
            }
            else {
                setMessage('Failed to submit overtime request.');
            }
        }
        catch (error) {
            console.error('Error during overtime request submission:', error);
            setMessage('Error occurred during overtime request submission.');
        }
    };
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="container bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Overtime Request</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="date" className="block text-gray-700 font-bold mb-2">Date</label>
            <input type="date" id="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border rounded" required/>
          </div>
          <div className="mb-4">
            <label htmlFor="hours" className="block text-gray-700 font-bold mb-2">Hours</label>
            <input type="number" id="hours" value={hours} onChange={(e) => setHours(e.target.value)} className="w-full px-3 py-2 border rounded" required/>
          </div>
          <div className="mb-4">
            <label htmlFor="reason" className="block text-gray-700 font-bold mb-2">Reason</label>
            <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 border rounded" required></textarea>
          </div>
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
            Submit
          </button>
          {message && <p className="mt-4 text-red-500">{message}</p>}
        </form>
      </div>
    </div>);
};
export default OvertimeRequestForm;
