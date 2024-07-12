import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { departmentShiftMap } from '../lib/shiftCache';

interface AdminShiftAdjustmentFormProps {
  lineUserId?: string | null;
}
interface DepartmentShift {
  department: string;
  shiftId: string;
}

const AdminShiftAdjustmentForm: React.FC<AdminShiftAdjustmentFormProps> = ({
  lineUserId,
}) => {
  const [targetType, setTargetType] = useState<'department' | 'individual'>(
    'department',
  );
  const [numberOfDepartments, setNumberOfDepartments] = useState(1);
  const [departmentShifts, setDepartmentShifts] = useState<DepartmentShift[]>([
    { department: '', shiftId: '' },
  ]);
  const [individualEmployeeId, setIndividualEmployeeId] = useState('');
  const [individualShiftId, setIndividualShiftId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [shifts, setShifts] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Fetch shifts from your API
    const fetchShifts = async () => {
      try {
        const response = await axios.get('/api/shifts');
        setShifts(response.data);
      } catch (error) {
        console.error('Error fetching shifts:', error);
      }
    };

    fetchShifts();
  }, []);

  useEffect(() => {
    setDepartmentShifts(
      Array(numberOfDepartments).fill({ department: '', shiftId: '' }),
    );
  }, [numberOfDepartments]);

  const handleDepartmentShiftChange = (
    index: number,
    field: 'department' | 'shiftId',
    value: string,
  ) => {
    const newDepartmentShifts = [...departmentShifts];
    newDepartmentShifts[index] = {
      ...newDepartmentShifts[index],
      [field]: value,
    };
    setDepartmentShifts(newDepartmentShifts);
  };

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
      const adjustments =
        targetType === 'department'
          ? departmentShifts
          : [{ employeeId: individualEmployeeId, shiftId: individualShiftId }];

      const response = await axios.post('/api/adjust-shift', {
        lineUserId,
        targetType,
        adjustments,
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
        <>
          <div>
            <label
              htmlFor="numberOfDepartments"
              className="block text-sm font-medium text-gray-700"
            >
              Number of Departments
            </label>
            <input
              type="number"
              id="numberOfDepartments"
              value={numberOfDepartments}
              onChange={(e) =>
                setNumberOfDepartments(Math.max(1, parseInt(e.target.value)))
              }
              min="1"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
          </div>
          {departmentShifts.map((depShift, index) => (
            <div key={index} className="bg-gray-100 p-4 rounded-lg mb-4">
              <div>
                <label
                  htmlFor={`department-${index}`}
                  className="block text-sm font-medium text-gray-700"
                >
                  Department
                </label>
                <select
                  id={`department-${index}`}
                  value={depShift.department}
                  onChange={(e) =>
                    handleDepartmentShiftChange(
                      index,
                      'department',
                      e.target.value,
                    )
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                >
                  <option value="">Select a department</option>
                  {Object.keys(departmentShiftMap).map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor={`shift-${index}`}
                  className="block text-sm font-medium text-gray-700"
                >
                  New Shift
                </label>
                <select
                  id={`shift-${index}`}
                  value={depShift.shiftId}
                  onChange={(e) =>
                    handleDepartmentShiftChange(
                      index,
                      'shiftId',
                      e.target.value,
                    )
                  }
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
            </div>
          ))}
        </>
      ) : (
        <>
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
              value={individualEmployeeId}
              onChange={(e) => setIndividualEmployeeId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
              placeholder="Enter employee ID"
            />
          </div>
          <div>
            <label
              htmlFor="individualShift"
              className="block text-sm font-medium text-gray-700"
            >
              New Shift
            </label>
            <select
              id="individualShift"
              value={individualShiftId}
              onChange={(e) => setIndividualShiftId(e.target.value)}
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
        </>
      )}

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
