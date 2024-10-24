//AdminShiftAdjustmentForm.tsx
import React, { useState, useEffect } from 'react';
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { Shift } from '../types/user';
import { startOfDay } from 'date-fns';

interface AdminShiftAdjustmentFormProps {
  lineUserId: string;
  shifts: Shift[];
  departments: { id: string; name: string }[];
}

interface FormValues {
  targetType: 'department' | 'individual';
  departmentShifts: { departmentId: string; shiftId: string }[];
  individualEmployeeId: string;
  individualShiftId: string;
  date: string;
  reason: string;
}

const AdminShiftAdjustmentForm: React.FC<AdminShiftAdjustmentFormProps> = ({
  lineUserId,
}) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        const [fetchedShifts, fetchedDepartments] = await Promise.all([
          axios.get('/api/shifts/shifts'),
          axios.get('/api/departments'),
        ]);
        setShifts(fetchedShifts.data);
        setDepartments(fetchedDepartments.data);
      } catch (error) {
        console.error('Error initializing form:', error);
        setMessage('Error initializing form. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    initialize();
  }, []);

  const validationSchema = Yup.object().shape({
    targetType: Yup.string()
      .oneOf(['department', 'individual'])
      .required('Target type is required'),
    departmentShifts: Yup.array().of(
      Yup.object().shape({
        departmentId: Yup.string().when('$targetType', {
          is: 'department',
          then: () => Yup.string().required('Department is required'),
          otherwise: () => Yup.string(),
        }),
        shiftId: Yup.string().when('$targetType', {
          is: 'department',
          then: () => Yup.string().required('Shift is required'),
          otherwise: () => Yup.string(),
        }),
      }),
    ),
    individualEmployeeId: Yup.string().when('targetType', {
      is: 'individual',
      then: () => Yup.string().required('Employee ID is required'),
      otherwise: () => Yup.string(),
    }),
    individualShiftId: Yup.string().when('targetType', {
      is: 'individual',
      then: () => Yup.string().required('Shift is required'),
      otherwise: () => Yup.string(),
    }),
    date: Yup.date()
      .required('Date is required')
      .min(startOfDay(new Date()), 'Date must not be in the past'),
    reason: Yup.string().required('Reason is required'),
  });

  const initialValues: FormValues = {
    targetType: 'department',
    departmentShifts: [{ departmentId: '', shiftId: '' }],
    individualEmployeeId: '',
    individualShiftId: '',
    date: '',
    reason: '',
  };

  const handleSubmit = async (
    values: FormValues,
    { setSubmitting, resetForm }: any,
  ) => {
    if (!lineUserId) {
      setMessage('Error: User ID is not available');
      setSubmitting(false);
      return;
    }

    try {
      const adjustments =
        values.targetType === 'department'
          ? values.departmentShifts.map((ds) => ({
              department: ds.departmentId,
              shiftId: ds.shiftId,
            }))
          : [
              {
                employeeId: values.individualEmployeeId,
                shiftId: values.individualShiftId,
              },
            ];

      const response = await axios.post('/api/adjust-shift', {
        lineUserId,
        targetType: values.targetType,
        adjustments,
        date: values.date,
        reason: values.reason,
      });

      setMessage('Shift adjustment(s) applied successfully.');
      resetForm();
    } catch (error: any) {
      console.error('Shift adjustment error:', error);
      setMessage(
        `Error applying shift adjustment(s): ${error.response?.data?.message || error.message}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-box shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-center">
            แบบฟอร์มปรับเวลาทำงาน
          </h2>
          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSubmit}
          >
            {({ values, isSubmitting, setFieldValue }) => (
              <Form>
                <div>
                  <label
                    htmlFor="targetType"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    เลือกประเภทการปรับเวลา
                  </label>
                  <Field
                    as="select"
                    id="targetType"
                    name="targetType"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                  >
                    <option value="department">รายแผนก</option>
                    <option value="individual">รายบุคคล</option>
                  </Field>
                  <ErrorMessage
                    name="targetType"
                    component="div"
                    className="text-red-500 text-xs mt-1"
                  />
                </div>

                {values.targetType === 'department' && (
                  <FieldArray name="departmentShifts">
                    {({ remove, push }) => (
                      <div>
                        {values.departmentShifts.map((_, index) => (
                          <div
                            key={index}
                            className="bg-gray-50 p-4 rounded-lg mb-4"
                          >
                            <div className="mb-4">
                              <label
                                htmlFor={`departmentShifts.${index}.departmentId`}
                                className="block text-sm font-medium text-gray-700 mb-1"
                              >
                                Department
                              </label>
                              <Field
                                as="select"
                                name={`departmentShifts.${index}.departmentId`}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              >
                                <option value="">Select a department</option>
                                {departments.map((dept) => (
                                  <option key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </option>
                                ))}
                              </Field>
                              <ErrorMessage
                                name={`departmentShifts.${index}.departmentId`}
                                component="div"
                                className="text-red-500 text-xs mt-1"
                              />
                            </div>
                            <div className="mb-4">
                              <label
                                htmlFor={`departmentShifts.${index}.shiftId`}
                                className="block text-sm font-medium text-gray-700 mb-1"
                              >
                                New Shift
                              </label>
                              <Field
                                as="select"
                                name={`departmentShifts.${index}.shiftId`}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              >
                                <option value="">Select a shift</option>
                                {shifts.map((shift) => (
                                  <option key={shift.id} value={shift.id}>
                                    {shift.name} ({shift.startTime} -{' '}
                                    {shift.endTime})
                                  </option>
                                ))}
                              </Field>
                              <ErrorMessage
                                name={`departmentShifts.${index}.shiftId`}
                                component="div"
                                className="text-red-500 text-xs mt-1"
                              />
                            </div>
                            {index > 0 && (
                              <button
                                type="button"
                                onClick={() => remove(index)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            push({ departmentId: '', shiftId: '' })
                          }
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Add Department
                        </button>
                      </div>
                    )}
                  </FieldArray>
                )}

                {values.targetType === 'individual' && (
                  <>
                    <div className="mb-4">
                      <label
                        htmlFor="individualEmployeeId"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Employee ID
                      </label>
                      <Field
                        type="text"
                        id="individualEmployeeId"
                        name="individualEmployeeId"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      />
                      <ErrorMessage
                        name="individualEmployeeId"
                        component="div"
                        className="text-red-500 text-xs mt-1"
                      />
                    </div>
                    <div className="mb-4">
                      <label
                        htmlFor="individualShiftId"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        New Shift
                      </label>
                      <Field
                        as="select"
                        id="individualShiftId"
                        name="individualShiftId"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                      >
                        <option value="">Select a shift</option>
                        {shifts.map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name} ({shift.startTime} - {shift.endTime})
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage
                        name="individualShiftId"
                        component="div"
                        className="text-red-500 text-xs mt-1"
                      />
                    </div>
                  </>
                )}

                <div className="mb-4">
                  <label
                    htmlFor="date"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Date
                  </label>
                  <Field
                    type="date"
                    id="date"
                    name="date"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                  />
                  <ErrorMessage
                    name="date"
                    component="div"
                    className="text-red-500 text-xs mt-1"
                  />
                </div>

                <div className="mb-4">
                  <label
                    htmlFor="reason"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Reason
                  </label>
                  <Field
                    as="textarea"
                    id="reason"
                    name="reason"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                    rows={3}
                  />
                  <ErrorMessage
                    name="reason"
                    component="div"
                    className="text-red-500 text-xs mt-1"
                  />
                </div>
                <div className="mt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting || !lineUserId}
                    className="w-full py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400"
                  >
                    {isSubmitting ? 'Applying...' : 'Apply Shift Adjustment'}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
          {message && (
            <p className="mt-2 text-sm text-center text-gray-600">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminShiftAdjustmentForm;
