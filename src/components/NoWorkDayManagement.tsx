import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { DatePicker } from '../components/ui/date-picker';
import { Input } from '../components/ui/input';
import { Table } from '../components/ui/table';

interface NoWorkDay {
  id: string;
  date: string;
  reason?: string;
}

interface NoWorkDayManagementProps {
  noWorkDays: NoWorkDay[];
  onAddNoWorkDay: (date: Date, reason: string) => Promise<void>;
  onDeleteNoWorkDay: (id: string) => Promise<void>;
}

const NoWorkDayManagement: React.FC<NoWorkDayManagementProps> = ({
  noWorkDays,
  onAddNoWorkDay,
  onDeleteNoWorkDay,
}) => {
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newReason, setNewReason] = useState('');

  const handleAddNoWorkDay = async () => {
    if (!newDate) return;

    await onAddNoWorkDay(newDate, newReason);

    setNewDate(null);
    setNewReason('');
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason' },
    {
      title: 'Action',
      key: 'action',
      dataIndex: 'id',
      render: (id: string) => (
        <Button onClick={() => onDeleteNoWorkDay(id)}>Delete</Button>
      ),
    },
  ];

  return (
    <div>
      <h1>No Work Day Management</h1>
      <div>
        <DatePicker
          value={newDate}
          onChange={(date) => setNewDate(date || null)}
        />
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
