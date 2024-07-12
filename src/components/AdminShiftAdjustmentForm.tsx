import React, { useState } from 'react';
import axios from 'axios';

interface AdminShiftAdjustmentFormProps {
  lineUserId?: string | null;
  departments?: { id: string; name: string }[];
  shifts?: { id: string; name: string }[];
}

const AdminShiftAdjustmentForm: React.FC<AdminShiftAdjustmentFormProps> = ({
  lineUserId,
  departments = [], // Provide default empty array
  shifts = [], // Provide default empty array
}) => {
  const [targetType, setTargetType] = useState<'department' | 'individual'>(
    'department',
  );
  const [targetId, setTargetId] = useState('');
  const [newShiftId, setNewShiftId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);

    if (!lineUserId) {
      setMessage('Error: User ID is not available');
      setIsLoading(false);
      return;
    }

    try {
      await axios.post('/api/adjust-shift', {
        lineUserId,
        targetType,
        targetId,
        newShiftId,
        date,
        reason,
      });

      setMessage('Shift adjustment(s) applied successfully.');
    } catch (error) {
      setMessage('Error applying shift adjustment(s). Please try again.');
      console.error('Shift adjustment error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="adjustFor"
          className="block text-sm font-medium text-gray-700"
        >
          Adjust for
        </label>
        <select
          id="adjustFor"
          value={targetType}
          onChange={(e) =>
            setTargetType(e.target.value as 'department' | 'individual')
          }
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        >
          <option value="department">Department</option>
          <option value="individual">Individual</option>
        </select>
      </div>

      {targetType === 'department' ? (
        <div>
          <label
            htmlFor="department"
            className="block text-sm font-medium text-gray-700"
          >
            Department
          </label>
          <select
            id="department"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          >
            <option value="">Select a department</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label
            htmlFor="employeeId"
            className="block text-sm font-medium text-gray-700"
          >
            Employee ID
          </label>
          <input
            id="employeeId"
            type="text"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            placeholder="Enter employee ID"
          />
        </div>
      )}

      <div>
        <label
          htmlFor="newShift"
          className="block text-sm font-medium text-gray-700"
        >
          New Shift
        </label>
        <select
          id="newShift"
          value={newShiftId}
          onChange={(e) => setNewShiftId(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        >
          <option value="">Select a shift</option>
          {shifts.map((shift) => (
            <option key={shift.id} value={shift.id}>
              {shift.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="date"
          className="block text-sm font-medium text-gray-700"
        >
          Date
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        />
      </div>

      <div>
        <label
          htmlFor="reason"
          className="block text-sm font-medium text-gray-700"
        >
          Reason
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          rows={3}
        ></textarea>
      </div>

      <button
        type="submit"
        disabled={isLoading || !lineUserId}
        className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
      >
        {isLoading ? 'Applying...' : 'Apply Shift Adjustment'}
      </button>

      {!lineUserId && (
        <p className="mt-2 text-sm text-center text-red-600">
          User ID is not available. Shift adjustment is disabled.
        </p>
      )}

      {message && (
        <p className="mt-2 text-sm text-center text-gray-600">{message}</p>
      )}
    </form>
  );
};

export default AdminShiftAdjustmentForm;
