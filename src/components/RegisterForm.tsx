import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { useEffect, useState } from 'react';
import liff from '@line/liff';

const RegistrationSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  nickname: Yup.string().required('Required'),
  department: Yup.string().required('Required'),
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

const RegisterForm = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [step, setStep] = useState(1);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then((profile) => {
            setLineUserId(profile.userId);
            setProfilePictureUrl(profile.pictureUrl);
          });
        } else {
          liff.login();
        }
      });
    } else {
      console.error('LIFF ID is not defined');
    }
  }, []);

  const handleNextStep = () => {
    setStep(step + 1);
  };

  const handlePreviousStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async (
    values: { name: string; nickname: string; department: string },
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void },
  ) => {
    try {
      const response = await axios.post('/api/registerUser', {
        ...values,
        lineUserId,
        profilePictureUrl,
      });
      if (response.data.success) {
        liff.closeWindow();
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
      <Formik
        initialValues={{
          name: '',
          nickname: '',
          department: '',
        }}
        validationSchema={RegistrationSchema}
        onSubmit={handleSubmit}
      >
        {({ isSubmitting }) => (
          <Form className="space-y-6">
            <div className="flex justify-between mb-4">
              <div
                className={`progress-step ${step >= 1 ? 'active' : ''}`}
              ></div>
              <div
                className={`progress-step ${step >= 2 ? 'active' : ''}`}
              ></div>
              <div
                className={`progress-step ${step >= 3 ? 'active' : ''}`}
              ></div>
            </div>
            <h5 className="text-xl font-medium text-gray-900 dark:text-white">
              ลงทะเบียนพนักงาน
            </h5>
            {step === 1 && (
              <div>
                <label
                  htmlFor="name"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  ชื่อ - นามสกุล
                </label>
                <Field
                  type="text"
                  name="name"
                  id="name"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                />
                <ErrorMessage
                  name="name"
                  component="div"
                  className="text-danger"
                />
                <div className="flex justify-end mt-4">
                  <button
                    type="button"
                    className="text-white bg-scarlet-700 hover:bg-scarlet-800 focus:outline-none focus:ring-4 focus:ring-scarlet-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-scarlet-600 dark:hover:bg-scarlet-700 dark:focus:ring-scarlet-900"
                    onClick={handleNextStep}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <label
                  htmlFor="nickname"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  ชื่อเล่น
                </label>
                <Field
                  type="text"
                  name="nickname"
                  id="nickname"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                />
                <ErrorMessage
                  name="nickname"
                  component="div"
                  className="text-danger"
                />
                <div className="flex justify-between mt-4">
                  <button
                    type="button"
                    className="text-white bg-red-700 hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900"
                    onClick={handlePreviousStep}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="text-white bg-scarlet-700 hover:bg-scarlet-800 focus:outline-none focus:ring-4 focus:ring-scarlet-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-scarlet-600 dark:hover:bg-scarlet-700 dark:focus:ring-scarlet-900"
                    onClick={handleNextStep}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <label
                  htmlFor="department"
                  className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                >
                  แผนก
                </label>
                <Field
                  as="select"
                  name="department"
                  id="department"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                >
                  <option value="">เลือกแผนก</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </Field>
                <ErrorMessage
                  name="department"
                  component="div"
                  className="text-danger"
                />
                <div className="flex justify-between mt-4">
                  <button
                    type="button"
                    className="text-white bg-red-700 hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900"
                    onClick={handlePreviousStep}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="text-white bg-scarlet-700 hover:bg-scarlet-800 focus:outline-none focus:ring-4 focus:ring-scarlet-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-scarlet-600 dark:hover:bg-scarlet-700 dark:focus:ring-scarlet-900"
                    disabled={isSubmitting}
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default RegisterForm;
