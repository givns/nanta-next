import React, { useState } from 'react';
import axios from 'axios';

const LeaveRequestForm: React.FC = () => {
  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    reason: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/requests/leave', form);
      alert('Leave request submitted successfully');
    } catch (error) {
      alert('Failed to submit leave request');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="date"
        name="startDate"
        value={form.startDate}
        onChange={handleChange}
        className="border p-2 w-full"
      />
      <input
        type="date"
        name="endDate"
        value={form.endDate}
        onChange={handleChange}
        className="border p-2 w-full"
      />
      <textarea
        name="reason"
        placeholder="Reason"
        value={form.reason}
        onChange={handleChange}
        className="border p-2 w-full"
      />
      <button type="submit" className="bg-blue-500 text-white p-2 rounded">
        Submit Leave Request
      </button>
    </form>
  );
};

export default LeaveRequestForm;