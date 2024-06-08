import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { useEffect, useState } from 'react';
import liff from '@line/liff';

const LeaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string().required('Required'),
  startDate: Yup.date().required('Required'),
  endDate: Yup.date().required('Required'),
});

const LeaveRequestForm = () => {
  const [lineUserId, setLineUserId] = useState('');

  useEffect(() => {
    // Initialize LIFF
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then(profile => {
            setLineUserId(profile.userId);
          });
        } else {
          liff.login();
        }
      });
    } else {
      console.error('LIFF ID is not defined');
    }
  }, []);

  const handleSubmit = async (values: any) => {
    try {
      const response = await axios.post('/api/leaveRequest', { ...values, userId: lineUserId });
      if (response.data.success) {
        alert('Leave request submitted successfully');
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">Leave Request</h1>
      <Formik
        initialValues={{
          leaveType: '',
          startDate: '',
          endDate: '',
        }}
        validationSchema={LeaveRequestSchema}
        onSubmit={handleSubmit}
      >
        <Form className="space-y-4">
          <div>
            <Field as="select" name="leaveType" className="w-full p-2 border rounded">
              <option value="">Select Leave Type</option>
              <option value="sick">Sick</option>
              <option value="vacation">Vacation</option>
              <option value="personal">Personal</option>
            </Field>
            <ErrorMessage name="leaveType" component="div" className="text-red-600" />
          </div>
          <div>
            <Field type="date" name="startDate" className="w-full p-2 border rounded" />
            <ErrorMessage name="startDate" component="div" className="text-red-600" />
          </div>
          <div>
            <Field type="date" name="endDate" className="w-full p-2 border rounded" />
            <ErrorMessage name="endDate" component="div" className="text-red-600" />
          </div>
          <button type="submit" className="w-full p-2 bg-blue-500 text-white rounded">
            Submit Leave Request
          </button>
        </Form>
      </Formik>
    </div>
  );
};

export default LeaveRequestForm;