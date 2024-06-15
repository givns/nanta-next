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

const departments = [
  'ฝ่ายผลิต',
  'ฝ่ายปฏิบัติการ',
  'ฝ่ายคัดคุณภาพและบรรจุ',
  'ฝ่ายขนส่ง',
  'ฝ่ายคลังสินค้าและแพ็คกิ้ง',
  'ฝ่ายสำนักงาน',
  'ฝ่ายประกันคุณภาพ',
  'ฝ่ายรักษาความสะอาด',
  'ฝ่ายรักษาความปลอดภัย',
];

const LeaveRequestForm = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [step, setStep] = useState(1);

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

  const handleSubmit = async (values: any) => {
    try {
      const response = await axios.post('/api/leaveRequest', {
        ...values,
        userId: lineUserId,
        status: 'pending',
      });
      if (response.data.success) {
        alert('Leave request submitted successfully');
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  return (
    <div className="container mx-auto p-4 bg-white rounded shadow-lg max-w-md">
      <h1 className="text-2xl font-bold mb-4">ขอวันลา</h1>
      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
        <div
          className="bg-blue-600 h-2.5 rounded-full"
          style={{ width: `${(step / 3) * 100}%` }}
        ></div>
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
        {({ isValid }) => (
          <Form className="space-y-4">
            {step === 1 && (
              <>
                <div>
                  <label htmlFor="leaveType">ประเภทการลา</label>
                  <Field
                    as="select"
                    name="leaveType"
                    className="w-full p-2 border rounded"
                  >
                    <option value="">เลือกประเภทการลา</option>
                    <option value="sick">ลาป่วย</option>
                    <option value="vacation">ลาพักร้อน</option>
                    <option value="personal">ลากิจ</option>
                  </Field>
                  <ErrorMessage
                    name="leaveType"
                    component="div"
                    className="text-red-600"
                  />
                </div>
                <div>
                  <label htmlFor="leaveFormat">รูปแบบวันลา</label>
                  <Field
                    as="select"
                    name="leaveFormat"
                    className="w-full p-2 border rounded"
                  >
                    <option value="">เลือกรูปแบบวันลา</option>
                    <option value="full-day">เต็มวัน</option>
                    <option value="half-day-morning">ครึ่งวันเช้า</option>
                    <option value="half-day-afternoon">ครึ่งวันบ่าย</option>
                  </Field>
                  <ErrorMessage
                    name="leaveFormat"
                    component="div"
                    className="text-red-600"
                  />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div>
                  <label htmlFor="startDate">วันที่เริ่มต้น</label>
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
                  <label htmlFor="endDate">วันที่สิ้นสุด</label>
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
              </>
            )}
            {step === 3 && (
              <>
                <div>
                  <label htmlFor="reason">เหตุผล</label>
                  <Field
                    as="textarea"
                    name="reason"
                    className="w-full p-2 border rounded"
                    rows={4}
                  />
                  <ErrorMessage
                    name="reason"
                    component="div"
                    className="text-red-600"
                  />
                </div>
              </>
            )}
            <div className="flex justify-between">
              {step > 1 && (
                <button
                  type="button"
                  className="p-2 bg-gray-500 text-white rounded"
                  onClick={prevStep}
                >
                  ย้อนกลับ
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  className="p-2 bg-blue-500 text-white rounded"
                  onClick={nextStep}
                  disabled={!isValid}
                >
                  ถัดไป
                </button>
              ) : (
                <button
                  type="submit"
                  className="p-2 bg-green-500 text-white rounded"
                >
                  ส่งคำขอ
                </button>
              )}
            </div>
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default LeaveRequestForm;
