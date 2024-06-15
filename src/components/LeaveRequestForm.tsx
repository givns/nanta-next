import { useState } from 'react';
import { useRouter } from 'next/router';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';

const LeaveRequestForm = () => {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const handleNextStep = () => setStep(step + 1);
  const handlePreviousStep = () => setStep(step - 1);

  const initialValues = {
    leaveType: '',
    leaveFormat: '',
    halfDay: '',
    startDate: '',
    endDate: '',
    reason: '',
  };

  const validationSchema = [
    Yup.object({
      leaveType: Yup.string().required('Required'),
    }),
    Yup.object({
      leaveFormat: Yup.string().required('Required'),
      halfDay: Yup.string().when('leaveFormat', {
        is: 'ครึ่งวัน',
        then: (schema) => schema.required('Required'),
        otherwise: (schema) => schema.notRequired(),
      }),
    }),
    Yup.object({
      startDate: Yup.date().required('Required'),
      endDate: Yup.date()
        .required('Required')
        .min(Yup.ref('startDate'), 'End date must be later than start date'),
    }),
    Yup.object({
      reason: Yup.string().required('Required'),
    }),
  ];

  const handleSubmit = async (values: any) => {
    sessionStorage.setItem('leaveSummary', JSON.stringify(values));
    router.push('/leave-summary');
  };

  return (
    <div className="container mx-auto bg-white p-4 rounded shadow">
      <div
        className="flex items-center mb-4"
        style={{
          backgroundColor: '#F0F0F0',
          padding: '10px',
          borderRadius: '8px',
        }}
      >
        <h1 className="text-2xl font-bold mb-0">ขอวันลา</h1>
      </div>
      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema[step - 1]}
        onSubmit={handleSubmit}
      >
        {({ values, setFieldValue, isValid }) => (
          <Form>
            <div className="mb-4">
              <div className="flex space-x-4 mb-4">
                <div
                  className={`flex-1 p-2 text-center ${step >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                >
                  ประเภทการลา
                </div>
                <div
                  className={`flex-1 p-2 text-center ${step >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                >
                  รูปแบบวันลา
                </div>
                <div
                  className={`flex-1 p-2 text-center ${step >= 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                >
                  ช่วงเวลาลา
                </div>
                <div
                  className={`flex-1 p-2 text-center ${step >= 4 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                >
                  เหตุผลการลา
                </div>
              </div>

              {step === 1 && (
                <div>
                  <label
                    htmlFor="leaveType"
                    className="block text-sm font-medium text-gray-700"
                  >
                    ประเภทการลา
                  </label>
                  <div id="leaveType" className="flex space-x-4">
                    <button
                      type="button"
                      className={`flex-1 p-2 rounded ${values.leaveType === 'ลาป่วย' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                      onClick={() => setFieldValue('leaveType', 'ลาป่วย')}
                    >
                      ลาป่วย 😷
                    </button>
                    <button
                      type="button"
                      className={`flex-1 p-2 rounded ${values.leaveType === 'ลากิจ' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                      onClick={() => setFieldValue('leaveType', 'ลากิจ')}
                    >
                      ลากิจ 💼
                    </button>
                    <button
                      type="button"
                      className={`flex-1 p-2 rounded ${values.leaveType === 'ลาพักร้อน' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                      onClick={() => setFieldValue('leaveType', 'ลาพักร้อน')}
                    >
                      ลาพักร้อน 🏖️
                    </button>
                  </div>
                  <ErrorMessage
                    name="leaveType"
                    component="div"
                    className="text-red-600"
                  />
                </div>
              )}

              {step === 2 && (
                <div>
                  <label
                    htmlFor="leaveFormat"
                    className="block text-sm font-medium text-gray-700"
                  >
                    รูปแบบวันลา
                  </label>
                  <div id="leaveFormat" className="flex space-x-4">
                    <button
                      type="button"
                      className={`flex-1 p-2 rounded ${values.leaveFormat === 'เต็มวัน' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                      onClick={() => setFieldValue('leaveFormat', 'เต็มวัน')}
                    >
                      ลาเต็มวัน
                    </button>
                    <button
                      type="button"
                      className={`flex-1 p-2 rounded ${values.leaveFormat === 'ครึ่งวัน' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                      onClick={() => setFieldValue('leaveFormat', 'ครึ่งวัน')}
                    >
                      ลาครึ่งวัน
                    </button>
                  </div>
                  <ErrorMessage
                    name="leaveFormat"
                    component="div"
                    className="text-red-600"
                  />
                  {values.leaveFormat === 'ครึ่งวัน' && (
                    <div className="mt-4 flex space-x-4">
                      <button
                        type="button"
                        className={`flex-1 p-2 rounded ${values.halfDay === 'เช้า' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                        onClick={() => setFieldValue('halfDay', 'เช้า')}
                      >
                        ครึ่งวันเช้า
                      </button>
                      <button
                        type="button"
                        className={`flex-1 p-2 rounded ${values.halfDay === 'บ่าย' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}
                        onClick={() => setFieldValue('halfDay', 'บ่าย')}
                      >
                        ครึ่งวันบ่าย
                      </button>
                    </div>
                  )}
                  <ErrorMessage
                    name="halfDay"
                    component="div"
                    className="text-red-600"
                  />
                </div>
              )}

              {step === 3 && (
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-gray-700"
                  >
                    วันที่เริ่มลา
                  </label>
                  <Field
                    id="startDate"
                    name="startDate"
                    type="date"
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  />
                  <ErrorMessage
                    name="startDate"
                    component="div"
                    className="text-red-600"
                  />
                  <label
                    htmlFor="endDate"
                    className="block text-sm font-medium text-gray-700 mt-4"
                  >
                    วันที่สิ้นสุดการลา
                  </label>
                  <Field
                    id="endDate"
                    name="endDate"
                    type="date"
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  />
                  <ErrorMessage
                    name="endDate"
                    component="div"
                    className="text-red-600"
                  />
                </div>
              )}

              {step === 4 && (
                <div>
                  <label
                    htmlFor="reason"
                    className="block text-sm font-medium text-gray-700"
                  >
                    เหตุผลในการลา
                  </label>
                  <Field
                    as="textarea"
                    id="reason"
                    name="reason"
                    rows={4}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
                  />
                  <ErrorMessage
                    name="reason"
                    component="div"
                    className="text-red-600"
                  />
                </div>
              )}
            </div>

            <div className="flex space-x-4 mt-4">
              {step > 1 && (
                <button
                  type="button"
                  className="flex-1 p-2 bg-gray-500 text-white rounded"
                  onClick={handlePreviousStep}
                >
                  ย้อนกลับ
                </button>
              )}
              {step < 4 && (
                <button
                  type="button"
                  className="flex-1 p-2 bg-blue-500 text-white rounded"
                  onClick={handleNextStep}
                  disabled={!isValid}
                >
                  ถัดไป
                </button>
              )}
              {step === 4 && (
                <button
                  type="submit"
                  className="flex-1 p-2 bg-green-500 text-white rounded"
                  disabled={!isValid}
                >
                  ยืนยัน & ส่งคำขอ
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
