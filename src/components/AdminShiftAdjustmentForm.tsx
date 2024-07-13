import React, { useState, useEffect } from 'react';
import { AdminShiftService } from '../services/AdminShiftService';
import { Shift } from '../types/user';

interface AdminShiftAdjustmentFormProps {
  lineUserId?: string;
}

const adminShiftService = new AdminShiftService();

const AdminShiftAdjustmentForm: React.FC<AdminShiftAdjustmentFormProps> = ({
  lineUserId,
}) => {
  const [targetType, setTargetType] = useState<'department' | 'individual'>(
    'department',
  );
  const [targetId, setTargetId] = useState('');
  const [departmentShifts, setDepartmentShifts] = useState<
    { department: string; shiftId: string }[]
  >([]);
  const [individualEmployeeId, setIndividualEmployeeId] = useState('');
  const [individualShiftId, setIndividualShiftId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fetchedDepartments, fetchedShifts] = await Promise.all([
          adminShiftService.getDepartments(),
          adminShiftService.getAllShifts(),
        ]);
        setDepartments(fetchedDepartments);
        setShifts(fetchedShifts);
      } catch (error) {
        console.error('Error fetching data:', error);
        setMessage('Error fetching departments and shifts. Please try again.');
      }
    };

    fetchData();
  }, []);

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
      if (targetType === 'department') {
        for (const depShift of departmentShifts) {
          await adminShiftService.createShiftAdjustment(
            depShift.department,
            depShift.shiftId,
            new Date(date),
            reason,
          );
        }
      } else {
        await adminShiftService.createShiftAdjustment(
          individualEmployeeId,
          individualShiftId,
          new Date(date),
          reason,
        );
      }

      setMessage('Shift adjustment(s) applied successfully.');
    } catch (error) {
      setMessage('Error applying shift adjustment(s). Please try again.');
      console.error('Shift adjustment error:', error);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
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
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
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
            type="text"
            id="employeeId"
            value={individualEmployeeId}
            onChange={(e) => setIndividualEmployeeId(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
          value={
            targetType === 'department'
              ? departmentShifts[0]?.shiftId
              : individualShiftId
          }
          onChange={(e) => {
            if (targetType === 'department') {
              setDepartmentShifts([
                { department: targetId, shiftId: e.target.value },
              ]);
            } else {
              setIndividualShiftId(e.target.value);
            }
          }}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          <option value="">Select a shift</option>
          {shifts.map((shift) => (
            <option key={shift.id} value={shift.id}>
              {shift.name} ({shift.startTime} - {shift.endTime})
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
          type="date"
          id="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
          rows={3}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        ></textarea>
      </div>

      <div>
        <button
          type="submit"
          disabled={isLoading || !lineUserId}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Applying...' : 'Apply Shift Adjustment'}
        </button>
      </div>

      {message && (
        <div
          className={`mt-2 text-sm text-center ${message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}
        >
          {message}
        </div>
      )}
    </form>
  );
};

export default AdminShiftAdjustmentForm;
