import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { useEffect, useState } from 'react';
import liff from '@line/liff';

const LeaveRequestSchema = Yup.object().shape({
  leaveType: Yup.string().required('Required'),
  leaveFormat: Yup.string().required('Required'),
  startDate: Yup.date().required('Required'),
  endDate: Yup.date().required('Required'),
  reason: Yup.string().required('Required'),
});

const LeaveRequestForm = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [step, setStep] = useState(1);
  const [selectedLeaveFormat, setSelectedLeaveFormat] = useState('');

  useEffect(() => {
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

  const nextStep = () => setStep((prevStep) => prevStep + 1);
  const prevStep = () => setStep((prevStep) => prevStep - 1);

  const handleSubmit = async (values: any) => {
    try {
      const response = await axios.post('/api/leaveRequest', {
        ...values,
        userId: lineUserId,
        status: 'pending',
      });
      if (response.status === 201) {
        liff.closeWindow();
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto p-4 bg-white shadow rounded">
      <div className="bg-[#F0F0F0] p-4 rounded mb-4">
        <h1 className="text-xl font-bold">ขอวันลา</h1>
      </div>
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
        {({ isValid, setFieldValue, values }) => (
          <Form>
            {step === 1 && (
              <>
                <div className="mb-4">
                  <label className="block text-gray-700">ประเภทการลา</label>
                  <div className="flex flex-col space-y-2">
                    <button
                      type="button"
                      className={`p-2 rounded ${values.leaveType === 'sick' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                      onClick={() => setFieldValue('leaveType', 'sick')}
                    >
                      ลาป่วย
                    </button>
                    <button
                      type="button"
                      className={`p-2 rounded ${values.leaveType === 'vacation' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                      onClick={() => setFieldValue('leaveType', 'vacation')}
                    >
                      ลาพักร้อน
                    </button>
                    <button
                      type="button"
                      className={`p-2 rounded ${values.leaveType === 'personal' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                      onClick={() => setFieldValue('leaveType', 'personal')}
                    >
                      ลากิจ
                    </button>
                  </div>
                  <ErrorMessage
                    name="leaveType"
                    component="div"
                    className="text-red-600"
                  />
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    className="p-2 bg-gray-200 text-gray-700 rounded"
                    onClick={prevStep}
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    className="p-2 bg-green-500 text-white rounded"
                    onClick={nextStep}
                    disabled={!isValid}
                  >
                    ถัดไป
                  </button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div className="mb-4">
                  <label className="block text-gray-700">รูปแบบการลา</label>
                  <div className="flex flex-col space-y-2">
                    <button
                      type="button"
                      className={`p-2 rounded ${selectedLeaveFormat === 'full-day' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                      onClick={() => {
                        setFieldValue('leaveFormat', 'full-day');
                        setSelectedLeaveFormat('full-day');
                      }}
                    >
                      ลาเต็มวัน
                    </button>
                    <button
                      type="button"
                      className={`p-2 rounded ${selectedLeaveFormat === 'half-day' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                      onClick={() => {
                        setFieldValue('leaveFormat', 'half-day');
                        setSelectedLeaveFormat('half-day');
                      }}
                    >
                      ลาครึ่งวัน
                    </button>
                  </div>
                  {selectedLeaveFormat === 'half-day' && (
                    <div className="flex flex-col space-y-2 mt-4">
                      <button
                        type="button"
                        className={`p-2 rounded ${values.leaveFormat === 'half-day-morning' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                        onClick={() =>
                          setFieldValue('leaveFormat', 'half-day-morning')
                        }
                      >
                        ครึ่งวันเช้า
                      </button>
                      <button
                        type="button"
                        className={`p-2 rounded ${values.leaveFormat === 'half-day-afternoon' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                        onClick={() =>
                          setFieldValue('leaveFormat', 'half-day-afternoon')
                        }
                      >
                        ครึ่งวันบ่าย
                      </button>
                    </div>
                  )}
                  <ErrorMessage
                    name="leaveFormat"
                    component="div"
                    className="text-red-600"
                  />
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    className="p-2 bg-gray-200 text-gray-700 rounded"
                    onClick={prevStep}
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    className="p-2 bg-green-500 text-white rounded"
                    onClick={nextStep}
                    disabled={!isValid}
                  >
                    ถัดไป
                  </button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="mb-4">
                  <label className="block text-gray-700">วันที่เริ่มต้น</label>
                  <Field
                    type="date"
                    name="startDate"
                    className="p-2 border rounded w-full"
                  />
                  <ErrorMessage
                    name="startDate"
                    component="div"
                    className="text-red-600"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700">วันที่สิ้นสุด</label>
                  <Field
                    type="date"
                    name="endDate"
                    className="p-2 border rounded w-full"
                  />
                  <ErrorMessage
                    name="endDate"
                    component="div"
                    className="text-red-600"
                  />
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    className="p-2 bg-gray-200 text-gray-700 rounded"
                    onClick={prevStep}
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    className="p-2 bg-green-500 text-white rounded"
                    onClick={nextStep}
                    disabled={!isValid}
                  >
                    ถัดไป
                  </button>
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <div className="mb-4">
                  <label className="block text-gray-700">หมายเหตุ</label>
                  <Field
                    as="textarea"
                    name="reason"
                    rows={4}
                    className="p-2 border rounded w-full"
                  />
                  <ErrorMessage
                    name="reason"
                    component="div"
                    className="text-red-600"
                  />
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    className="p-2 bg-gray-200 text-gray-700 rounded"
                    onClick={prevStep}
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="submit"
                    className="p-2 bg-green-500 text-white rounded"
                  >
                    ส่งคำขอ
                  </button>
                </div>
              </>
            )}
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default LeaveRequestForm;
