//component/no-work-day-management.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { DatePicker } from '../components/ui/date-picker';
import { Input } from '../components/ui/input';
import { Table } from '../components/ui/table';

interface NoWorkDay {
  id: string;
  date: string;
  reason?: string;
}

const NoWorkDayManagement: React.FC = () => {
  const [noWorkDays, setNoWorkDays] = useState<NoWorkDay[]>([]);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newReason, setNewReason] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    fetchNoWorkDays();
  }, []);

  const fetchNoWorkDays = async () => {
    const response = await fetch('/api/noWorkDays');
    const data = await response.json();
    setNoWorkDays(data);
  };

  const handleAddNoWorkDay = async () => {
    if (!newDate) return;

    await fetch('/api/noWorkDays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newDate, reason: newReason }),
    });

    setNewDate(null);
    setNewReason('');
    fetchNoWorkDays();
  };

  const handleDeleteNoWorkDay = async (id: string) => {
    await fetch(`/api/noWorkDays/${id}`, { method: 'DELETE' });
    fetchNoWorkDays();
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason' },
    {
      title: 'Action',
      key: 'action',
      dataIndex: 'id',
      render: (id: string) => (
        <Button onClick={() => handleDeleteNoWorkDay(id)}>Delete</Button>
      ),
    },
  ];
  // Wrapper function to handle undefined and convert it to null
  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date ?? null);
  };

  return (
    <div>
      <h1>No Work Day Management</h1>
      <div>
        <DatePicker value={selectedDate} onChange={handleDateChange} />
        <Input
          placeholder="Reason"
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
        />
        <Button onClick={handleAddNoWorkDay}>Add No Work Day</Button>
      </div>
      <Table columns={columns} dataSource={noWorkDays} />
    </div>
  );
};

export default NoWorkDayManagement;
