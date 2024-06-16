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

  useEffect(() => {
    // Initialize LIFF
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      liff.init({ liffId }).then(() => {
        if (liff.isLoggedIn()) {
          liff.getProfile().then((profile) => {
            setLineUserId(profile.userId);
            setProfilePictureUrl(profile.pictureUrl); // Capture the profile picture URL
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
        profilePictureUrl, // Include the profile picture URL
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
    <div className="container-fluid vh-100 d-flex flex-column justify-content-between">
      <div className="container my-auto p-4 shadow rounded bg-white">
        <h3 className="mb-4 text-center">ลงทะเบียนพนักงาน</h3>
        <Formik
          initialValues={{
            name: '',
            nickname: '',
            department: '',
          }}
          validationSchema={RegistrationSchema}
          onSubmit={handleSubmit}
        >
          <Form>
            <div className="mb-3">
              <label htmlFor="name" className="form-label">
                ชื่อ - นามสกุล
              </label>
              <Field
                type="text"
                name="name"
                id="name"
                className="form-control"
                placeholder="ชื่อ-นามสกุล"
              />
              <ErrorMessage
                name="name"
                component="div"
                className="text-danger"
              />
            </div>
            <div className="mb-3">
              <label htmlFor="nickname" className="form-label">
                ชื่อเล่น
              </label>
              <Field
                type="text"
                name="nickname"
                id="nickname"
                className="form-control"
                placeholder="ชื่อเล่น"
              />
              <ErrorMessage
                name="nickname"
                component="div"
                className="text-danger"
              />
            </div>
            <div className="mb-3">
              <label htmlFor="department" className="form-label">
                แผนก
              </label>
              <Field
                as="select"
                name="department"
                id="department"
                className="form-control"
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
            </div>
          </Form>
        </Formik>
      </div>
      <button
        type="submit"
        form="registrationForm"
        className="btn btn-danger btn-lg w-100 fixed-bottom"
      >
        ลงทะเบียน
      </button>
    </div>
  );
};

export default RegisterForm;
