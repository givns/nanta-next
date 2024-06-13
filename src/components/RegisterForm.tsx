import { Formik, Field, Form, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import { useEffect, useState } from 'react';
import liff from '@line/liff';

const RegistrationSchema = Yup.object().shape({
  name: Yup.string().required('Required'),
  nickname: Yup.string().required('Required'),
  department: Yup.string().required('Required'),
  employeeNumber: Yup.string().required('Required'),
});

const departments = [
  'ฝ่ายผลิต',
  'ฝ่ายปฎิบัติการ',
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
      const response = await axios.post('/api/registerUser', {
        ...values,
        lineUserId,
      });
      if (response.data.success) {
        liff.closeWindow();
      } else {
        alert('Error: ' + response.data.error);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-2xl font-bold mb-4">Register</h1>
      <Formik
        initialValues={{
          name: '',
          nickname: '',
          department: '',
          employeeNumber: '',
        }}
        validationSchema={RegistrationSchema}
        onSubmit={handleSubmit}
      >
        <Form className="space-y-4">
          <div>
            <Field
              type="text"
              name="name"
              placeholder="Name"
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
              placeholder="Nickname"
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
              <option value="">Select Department</option>
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
          <div>
            <Field
              type="text"
              name="employeeNumber"
              placeholder="Employee Number"
              className="w-full p-2 border rounded"
            />
            <ErrorMessage
              name="employeeNumber"
              component="div"
              className="text-red-600"
            />
          </div>
          <button
            type="submit"
            className="w-full p-2 bg-blue-500 text-white rounded"
          >
            Register
          </button>
        </Form>
      </Formik>
    </div>
  );
};

export default RegisterForm;
