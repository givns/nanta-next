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

  const handleSubmit = async (values: {
    name: string;
    nickname: string;
    department: string;
  }) => {
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
    }
  };

  return (
    <div className="main-container">
      <div className="mobile-area">
        <div className="header">
          <div className="progress-bar-container">
            <div className={`progress-step ${step >= 1 ? 'active' : ''}`}></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}></div>
            <div className={`progress-step ${step >= 3 ? 'active' : ''}`}></div>
          </div>
          <h3 className="header-text">ลงทะเบียนพนักงาน</h3>
        </div>
        <div className="form-container">
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
              <Form id="registrationForm">
                {step === 1 && (
                  <div>
                    <div className="mb-3">
                      <label htmlFor="name" className="form-label">
                        ชื่อ - นามสกุล
                      </label>
                      <Field
                        type="text"
                        name="name"
                        id="name"
                        className="form-control input-box"
                        placeholder="ชื่อ-นามสกุล"
                      />
                      <ErrorMessage
                        name="name"
                        component="div"
                        className="text-danger"
                      />
                    </div>
                    <div className="button-container">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleNextStep}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <div>
                    <div className="mb-3">
                      <label htmlFor="nickname" className="form-label">
                        ชื่อเล่น
                      </label>
                      <Field
                        type="text"
                        name="nickname"
                        id="nickname"
                        className="form-control input-box"
                        placeholder="ชื่อเล่น"
                      />
                      <ErrorMessage
                        name="nickname"
                        component="div"
                        className="text-danger"
                      />
                    </div>
                    <div className="button-container">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handlePreviousStep}
                        style={{ backgroundColor: '#ffede9', color: '#000' }}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleNextStep}
                        style={{ backgroundColor: '#ff1900', color: '#000' }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div>
                    <div className="mb-3">
                      <label htmlFor="department" className="form-label">
                        แผนก
                      </label>
                      <Field
                        as="select"
                        name="department"
                        id="department"
                        className="form-control input-box"
                        style={{ backgroundColor: '#fff', color: '#000' }}
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
                    <div className="button-container">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handlePreviousStep}
                        style={{ backgroundColor: '#ffede9', color: '#000' }}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSubmitting}
                        style={{ backgroundColor: '#ff1900', color: '#000' }}
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
      </div>
    </div>
  );
};

export default RegisterForm;
