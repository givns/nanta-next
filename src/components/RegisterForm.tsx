import { Formik, Field, Form, ErrorMessage, FormikHelpers } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { useEffect, useState } from 'react';
import liff from '@line/liff';

const RegistrationSchema = Yup.object().shape({
  employeeId: Yup.string().required('Required'),
  name: Yup.string().required('Required'),
  nickname: Yup.string().required('Required'),
  department: Yup.string().required('Required'),
});

const departments = [
  'ฝ่ายปฏิบัติการ',
  'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)',
  'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)',
  'ฝ่ายผลิต-คัดคุณภาพและบรรจุ',
  'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง',
  'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์',
  'ฝ่ายประกันคุณภาพ',
  'ฝ่ายคลังสินค้าและแพ็คกิ้ง',
  'ฝ่ายจัดส่งสินค้า',
  'ฝ่ายจัดซื้อและประสานงานขาย',
  'ฝ่ายบัญชีและการเงิน',
  'ฝ่ายทรัพยากรบุคคล',
  'ฝ่ายรักษาความสะอาด',
  'ฝ่ายรักษาความปลอดภัย',
];

interface FormValues {
  employeeId: string;
  name: string;
  nickname: string;
  department: string;
}

const RegisterForm: React.FC = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [step, setStep] = useState(1);
  const [externalUserData, setExternalUserData] = useState<any>(null);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then((profile) => {
            setLineUserId(profile.userId);
            setProfilePictureUrl(profile.pictureUrl || '');
          });
        } else {
          liff.login();
        }
      });
    } else {
      console.error('LIFF ID is not defined');
    }
  }, []);

  const fetchExternalUserData = async (employeeId: string) => {
    try {
      const response = await axios.get(
        `/api/getExternalUserData?employeeId=${employeeId}`,
      );
      setExternalUserData(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching external user data:', error);
      return null;
    }
  };

  const handleNextStep = async (
    values: FormValues,
    setFieldValue: (
      field: string,
      value: any,
      shouldValidate?: boolean,
    ) => void,
  ) => {
    if (step === 1) {
      const data = await fetchExternalUserData(values.employeeId);
      if (data) {
        setFieldValue('name', data.name);
        setFieldValue('department', data.department);
      }
    }
    setStep(step + 1);
  };

  const handleSubmit = async (
    values: FormValues,
    { setSubmitting }: FormikHelpers<FormValues>,
  ) => {
    try {
      const response = await axios.post('/api/registerUser', {
        ...values,
        lineUserId,
        profilePictureUrl,
      });

      if (response.data.success) {
        alert('Registration successful!');
        liff.closeWindow();
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error) {
      alert(
        'Error: ' + (error as any).response?.data?.message ||
          (error as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="main-container flex justify-center items-center h-screen">
      <div className="w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-6 md:p-8 dark:bg-gray-800 dark:border-gray-700">
        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-4">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${(step / 3) * 100}%` }}
          ></div>
        </div>
        <h5 className="text-xl font-medium text-gray-900 dark:text-white text-center mb-4">
          ลงทะเบียนพนักงาน
        </h5>
        <Formik
          initialValues={{
            employeeId: '',
            name: '',
            nickname: '',
            department: '',
          }}
          validationSchema={RegistrationSchema}
          onSubmit={handleSubmit}
        >
          {({ isSubmitting, values, setFieldValue, isValid, dirty }) => (
            <Form className="space-y-6">
              {step === 1 && (
                <div>
                  <div className="mb-3">
                    <label
                      htmlFor="employeeId"
                      className="block mb-2 text-sm font-medium text-gray-900 dark:text-white"
                    >
                      รหัสพนักงาน
                    </label>
                    <Field
                      type="text"
                      name="employeeId"
                      id="employeeId"
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                      placeholder="รหัสพนักงาน"
                    />
                    <ErrorMessage
                      name="employeeId"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                  <div className="button-container flex justify-end">
                    <button
                      type="button"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                      onClick={() => handleNextStep(values, setFieldValue)}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <div className="mb-3">
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
                      placeholder="ชื่อ-นามสกุล"
                    />
                    <ErrorMessage
                      name="name"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                  <div className="mb-3">
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
                      placeholder="ชื่อเล่น"
                    />
                    <ErrorMessage
                      name="nickname"
                      component="div"
                      className="text-red-500 text-sm"
                    />
                  </div>
                  <div className="button-container flex justify-end">
                    <button
                      type="button"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                      onClick={() => handleNextStep(values, setFieldValue)}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div>
                  <div className="mb-3">
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
                      className="text-red-500 text-sm"
                    />
                  </div>
                  {externalUserData && (
                    <div className="mb-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        กะการทำงานจะถูกกำหนดโดยอัตโนมัติตามแผนกของคุณ
                      </p>
                    </div>
                  )}
                  <div className="button-container flex justify-end">
                    <button
                      type="submit"
                      className="text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 font-medium rounded-full text-sm px-5 py-2.5 text-center me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                      disabled={isSubmitting || !isValid || !dirty}
                    >
                      {isSubmitting ? 'กำลังส่งเก็บข้อมูล...' : 'ยืนยัน'}
                    </button>
                  </div>
                </div>
              )}
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default RegisterForm;
