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

  const handleSubmit = async (values: any) => {
    try {
      const response = await axios.post('/api/registerUser', {
        ...values,
        lineUserId,
      });
      if (response.data.success) {
        liff.closeWindow();
      } else {
        console.error('Error: ' + response.data.error);
      }
    } catch (error: any) {
      console.error('Error: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">ลงทะเบียน</h1>
      <Formik
        initialValues={{
          name: '',
          nickname: '',
          department: '',
        }}
        validationSchema={RegistrationSchema}
        onSubmit={handleSubmit}
      >
        <Form className="space-y-4 w-full max-w-xs">
          <div>
            <Field
              type="text"
              name="name"
              placeholder="ชื่อ - นามสกุล"
              className="w-full p-2 border rounded"
            />
            <ErrorMessage
              name="name"
              component="div"
              className="text-red-600"
            />
          </div>
          <div>
            <Field
              type="text"
              name="nickname"
              placeholder="ชื่อเล่น"
              className="w-full p-2 border rounded"
            />
            <ErrorMessage
              name="nickname"
              component="div"
              className="text-red-600"
            />
          </div>
          <div>
            <Field
              as="select"
              name="department"
              className="w-full p-2 border rounded"
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
              className="text-red-600"
            />
          </div>
          <button
            type="submit"
            className="w-full p-2 bg-blue-500 text-white rounded"
          >
            ลงทะเบียน
          </button>
        </Form>
      </Formik>
    </div>
  );
};

export default RegisterForm;
