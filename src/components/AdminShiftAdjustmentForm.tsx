import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Shift } from '../types/user';
import { departmentShiftMap } from '../lib/shiftCache';

interface AdminShiftAdjustmentFormProps {
  lineUserId?: string;
}

const AdminShiftAdjustmentForm: React.FC<AdminShiftAdjustmentFormProps> = ({
  lineUserId,
}) => {
  const [targetType, setTargetType] = useState<'department' | 'individual'>(
    'department',
  );
  const [numberOfDepartments, setNumberOfDepartments] = useState<string>('1');
  const [departmentShifts, setDepartmentShifts] = useState<
    { department: string; shiftId: string }[]
  >([{ department: '', shiftId: '' }]);
  const [individualEmployeeId, setIndividualEmployeeId] = useState('');
  const [individualShiftId, setIndividualShiftId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchShifts = async () => {
      try {
        const response = await axios.get('/api/shifts/shifts');
        setShifts(response.data);
      } catch (error) {
        console.error('Error fetching shifts:', error);
        setMessage('Error fetching shifts. Please try again.');
      }
    };

    fetchShifts();
  }, []);

  useEffect(() => {
    const num = parseInt(numberOfDepartments) || 1;
    setDepartmentShifts(Array(num).fill({ department: '', shiftId: '' }));
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

  const isDateValid = (selectedDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(selectedDate) >= today;
  };

  const isFormValid = () => {
    if (targetType === 'department') {
      return departmentShifts.every((ds) => ds.department && ds.shiftId);
    } else {
      return individualEmployeeId && individualShiftId;
    }
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
    if (!isDateValid(date)) {
      setMessage('Error: Selected date must not be in the past');
      setIsLoading(false);
      return;
    }
    if (!isFormValid()) {
      setMessage('Error: Please fill in all required fields');
      setIsLoading(false);
      return;
    }

    if (!confirm('Are you sure you want to apply these shift adjustments?')) {
      return;
    }

    try {
      const adjustments =
        targetType === 'department'
          ? departmentShifts.map((ds) => ({
              department: ds.department,
              shiftId: ds.shiftId,
            }))
          : [{ employeeId: individualEmployeeId, shiftId: individualShiftId }];

      await axios.post('/api/adjust-shift', {
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
          <option value="department">รายแผนก</option>
          <option value="individual">รายบุคคล</option>
        </select>
      </div>

      {targetType === 'department' && (
        <div className="flex items-center space-x-2">
          <label
            htmlFor="numberOfDepartments"
            className="block text-sm font-medium text-gray-700"
          >
            Number of Departments
          </label>
          <input
            type="text"
            id="numberOfDepartments"
            value={numberOfDepartments}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, '');
              setNumberOfDepartments(
                value === '' ? '' : String(Math.max(1, parseInt(value) || 1)),
              );
            }}
            className="mt-1 block w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            inputMode="numeric"
          />
        </div>
      )}

      {targetType === 'department' ? (
        <>
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
                      {shift.name} ({shift.startTime} - {shift.endTime})
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
                  {shift.name} ({shift.startTime} - {shift.endTime})
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
        className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
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
