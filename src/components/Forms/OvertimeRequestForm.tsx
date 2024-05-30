import React, { useState } from 'react';
import axios from 'axios';

const OvertimeRequestForm: React.FC = () => {
  const [form, setForm] = useState({
    date: '',
    hours: 0,
    reason: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/requests/overtime', form);
      alert('Overtime request submitted successfully');
    } catch (error) {
      alert('Failed to submit overtime request');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="date"
        name="date"
        value={form.date}
        onChange={handleChange}
        className="border p-2 w-full"
      />
      <input
        type="number"
        name="hours"
        value={form.hours}
        onChange={handleChange}
        className="border p-2 w-full"
        min="0"
      />
      <textarea
        name="reason"
        placeholder="Reason"
        value={form.reason}
        onChange={handleChange}
        className="border p-2 w-full"
      />
      <button type="submit" className="bg-blue-500 text-white p-2 rounded">
        Submit Overtime Request
      </button>
    </form>
  );
};

export default OvertimeRequestForm;