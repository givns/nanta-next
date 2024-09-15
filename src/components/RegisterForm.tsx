import React, { useState, useEffect, useCallback } from 'react';
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as Yup from 'yup';
import axios from 'axios';
import liff from '@line/liff';
import NextImage from 'next/image';
import Cropper from 'react-easy-crop';
import { Point, Area } from 'react-easy-crop/types';

const ExistingEmployeeSchema = Yup.object().shape({
  employeeId: Yup.string().required('Required'),
});

const RegisterForm: React.FC = () => {
  const [lineUserId, setLineUserId] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [originalProfilePictureUrl, setOriginalProfilePictureUrl] =
    useState('');
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isEditingPicture, setIsEditingPicture] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineUserId(profile.userId);
          setProfilePictureUrl(profile.pictureUrl || '');
        } else {
          liff.login();
        }
      } catch (error) {
        console.error('LIFF initialization failed', error);
      }
    };

    initializeLiff();
  }, []);

  // In your React component (e.g., RegisterForm.tsx)
  const handleExistingEmployeeSubmit = async (
    values: any,
    { setSubmitting, setFieldError }: any,
  ) => {
    try {
      const response = await axios.post('/api/checkExistingEmployee', {
        employeeId: values.employeeId,
      });

      if (response.data.success) {
        setUserInfo(response.data.user);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.error('Error checking existing employee:', error);
      if (error.response && error.response.status === 404) {
        setFieldError('employeeId', 'Employee ID not found');
      } else {
        setFieldError(
          'employeeId',
          'Error occurred while checking employee ID',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRegistration = async () => {
    try {
      const response = await axios.post('/api/confirmRegistration', {
        employeeId: userInfo.employeeId,
        lineUserId,
        profilePictureUrl,
      });

      if (response.data.success) {
        alert(
          'Registration successful! Please check your LINE app for further instructions.',
        );
        liff.closeWindow();
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      console.error('Error confirming registration:', error);
      alert('Error occurred during registration confirmation');
    }
  };

  const handleEditPicture = () => {
    setIsEditingPicture(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePictureUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error: any) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
  ): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    canvas.width = 200;
    canvas.height = 200;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      200,
      200,
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, 'image/jpeg');
    });
  };

  const handleSavePicture = async () => {
    if (!croppedAreaPixels) {
      alert('Please crop the image before saving');
      return;
    }

    try {
      const croppedImage = await getCroppedImg(
        profilePictureUrl,
        croppedAreaPixels,
      );

      // Convert blob URL to Blob object
      const response = await fetch(croppedImage);
      const blob = await response.blob();

      // Create FormData and append the Blob
      const formData = new FormData();
      formData.append('image', blob, 'profile.jpg');
      formData.append('employeeId', userInfo.employeeId);

      // Send the cropped image to the server
      const uploadResponse = await axios.post(
        '/api/uploadCroppedProfilePicture',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );

      if (uploadResponse.data.success) {
        setProfilePictureUrl(uploadResponse.data.imageUrl);
        setOriginalProfilePictureUrl(uploadResponse.data.imageUrl);
        setIsEditingPicture(false);
        alert('Profile picture updated successfully');
      } else {
        throw new Error('Failed to upload image');
      }
    } catch (error) {
      console.error('Error saving cropped image:', error);
      alert('Failed to save cropped image');
    }
  };

  const handleCancelEdit = () => {
    setIsEditingPicture(false);
    setProfilePictureUrl(originalProfilePictureUrl);
  };

  if (userInfo) {
    // When userInfo is available
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-6 text-center">
          Confirm Your Information
        </h2>
        <div className="flex flex-col items-center mb-6">
          <div className="w-32 h-32 rounded-full overflow-hidden mb-4 relative">
            {isEditingPicture ? (
              <div className="w-full h-full">
                <Cropper
                  image={profilePictureUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  cropShape="round"
                  showGrid={false}
                />
              </div>
            ) : (
              <NextImage
                src={profilePictureUrl || '/default-avatar.png'}
                alt="Profile"
                width={128}
                height={128}
                className="object-cover"
              />
            )}
            {!isEditingPicture && (
              <button
                onClick={handleEditPicture}
                className="absolute bottom-0 right-0 bg-blue-500 text-white p-1 rounded-full z-10"
              >
                Edit
              </button>
            )}
          </div>
          {isEditingPicture && (
            <div className="flex flex-col items-center">
              <input
                type="file"
                onChange={handleFileChange}
                className="mb-2"
                accept="image/*"
              />
              <div>
                <button
                  onClick={handleSavePicture}
                  className="bg-blue-500 text-white p-2 rounded mr-2"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="bg-red-500 text-white p-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <p>
            <strong>รหัสพนักงาน:</strong> {userInfo.employeeId}
          </p>
          <p>
            <strong>ชื่อ-สกุล:</strong> {userInfo.name}
          </p>
          <p>
            <strong>ชื่อเล่น:</strong> {userInfo.nickname}
          </p>
          <p>
            <strong>แผนก:</strong> {userInfo.departmentName}
          </p>
          <p>
            <strong>วันลาป่วยคงเหลือ:</strong> {userInfo.sickLeaveBalance}
          </p>
          <p>
            <strong>วันลากิจคงเหลือ:</strong> {userInfo.businessLeaveBalance}
          </p>
          <p>
            <strong>วันลาพักร้อนคงเหลือ:</strong> {userInfo.annualLeaveBalance}
          </p>
          <button
            onClick={handleConfirmRegistration}
            className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            ยืนยันข้อมูล
          </button>
        </div>
      </div>
    );
  } else {
    // When userInfo is not available
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-6 text-center">
          ลงทะเบียนพนักงาน
        </h2>
        <Formik
          initialValues={{ employeeId: '' }}
          validationSchema={ExistingEmployeeSchema}
          onSubmit={handleExistingEmployeeSubmit}
        >
          {({ isSubmitting }) => (
            <Form className="space-y-4">
              <div>
                <Field
                  name="employeeId"
                  type="text"
                  placeholder="Employee ID"
                  className="w-full p-2 border rounded"
                />
                <ErrorMessage
                  name="employeeId"
                  component="div"
                  className="text-red-500 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
              >
                {isSubmitting ? 'Checking...' : 'Check Employee ID'}
              </button>
            </Form>
          )}
        </Formik>
      </div>
    );
  }
};

export default RegisterForm;
