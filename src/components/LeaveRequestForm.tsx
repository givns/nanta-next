import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import liff from '@line/liff';

const LeaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string().required('Required'),
  startDate: Yup.date().required('Required'),
  endDate: Yup.date().required('Required'),
  leaveFormat: Yup.string().required('Required'),
  reason: Yup.string().required('Required'),
});

const LeaveRequestForm = () => {
  const [lineUserId, setLineUserId] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Initialize LIFF
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then((profile) => {
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

  const handleSubmit = (values: any) => {
    // Include lineUserId in the submission data
    const submissionData = {
      ...values,
      userId: lineUserId,
    };
    // Store leave request data in session storage
    sessionStorage.setItem('leaveSummary', JSON.stringify(submissionData));
    // Redirect to leave summary page
    router.push('/leave-summary');
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">Leave Request</h1>
      <Formik
        initialValues={{
          leaveType: '',
          leaveFormat: '',
          startDate: '',
          endDate: '',
          reason: '',
        }}
        validationSchema={LeaveRequestSchema}
        onSubmit={handleSubmit}
      >
        <Form className="space-y-4">
          <div>
            <Field
              as="select"
              name="leaveType"
              className="w-full p-2 border rounded"
            >
              <option value="">Select Leave Type</option>
              <option value="ลาพักร้อน">ลาพักร้อน 🌴</option>
              <option value="ลาป่วย">ลาป่วย 🤒</option>
              <option value="ลากิจ">ลากิจ 👜</option>
            </Field>
            <ErrorMessage
              name="leaveType"
              component="div"
              className="text-red-600"
            />
          </div>
          <div>
            <Field
              as="select"
              name="leaveFormat"
              className="w-full p-2 border rounded"
            >
              <option value="">รูปแบบการลา</option>
              <option value="ลาครึ่งวัน">ลาครึ่งวัน</option>
              <option value="ลาครึ่งวันช่วงเช้า">ลาครึ่งวันช่วงเช้า</option>
              <option value="ลาครึ่งวันช่วงบ่าย">ลาครึ่งวันช่วงบ่าย</option>
              <option value="ลาเต็มวัน">ลาเต็มวัน</option>
            </Field>
            <ErrorMessage
              name="leaveFormat"
              component="div"
              className="text-red-600"
            />
          </div>
          <div>
            <Field
              type="date"
              name="startDate"
              className="w-full p-2 border rounded"
            />
            <ErrorMessage
              name="startDate"
              component="div"
              className="text-red-600"
            />
          </div>
          <div>
            <Field
              type="date"
              name="endDate"
              className="w-full p-2 border rounded"
            />
            <ErrorMessage
              name="endDate"
              component="div"
              className="text-red-600"
            />
          </div>
          <div>
            <Field
              type="text"
              name="reason"
              placeholder="ระบุสาเหตุการลา"
              className="w-full p-2 border rounded"
            />
            <ErrorMessage
              name="reason"
              component="div"
              className="text-red-600"
            />
          </div>
          <button
            type="submit"
            className="w-full p-2 bg-blue-500 text-white rounded"
          >
            Submit Leave Request
          </button>
        </Form>
      </Formik>
    </div>
  );
};

export default LeaveRequestForm;
