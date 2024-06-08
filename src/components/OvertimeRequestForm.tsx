import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { useEffect, useState } from 'react';
import liff from '@line/liff';

const OvertimeRequestSchema = Yup.object().shape({
  date: Yup.date().required('Required'),
  hours: Yup.number().required('Required').positive('Must be positive').integer('Must be an integer'),
  reason: Yup.string().required('Required'),
});

const OvertimeRequestForm = () => {
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
      const response = await axios.post('/api/overtimeRequest', { ...values, userId: lineUserId });
      if (response.data.success) {
        alert('Overtime request submitted successfully');
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">Overtime Request</h1>
      <Formik
        initialValues={{
          date: '',
          hours: 0,
          reason: '',
        }}
        validationSchema={OvertimeRequestSchema}
        onSubmit={handleSubmit}
      >
        <Form className="space-y-4">
          <div>
            <Field type="date" name="date" className="w-full p-2 border rounded" />
            <ErrorMessage name="date" component="div" className="text-red-600" />
          </div>
          <div>
            <Field type="number" name="hours" placeholder="Hours" className="w-full p-2 border rounded" />
            <ErrorMessage name="hours" component="div" className="text-red-600" />
          </div>
          <div>
            <Field type="text" name="reason" placeholder="Reason" className="w-full p-2 border rounded" />
            <ErrorMessage name="reason" component="div" className="text-red-600" />
          </div>
          <button type="submit" className="w-full p-2 bg-blue-500 text-white rounded">
            Submit Overtime Request
          </button>
        </Form>
      </Formik>
    </div>
  );
};

export default OvertimeRequestForm;