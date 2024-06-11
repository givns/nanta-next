import React, { useEffect, useState } from 'react';
import liff from '@line/liff';
const RegisterForm = () => {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [department, setDepartment] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [message, setMessage] = useState('');
  const [pictureUrl, setPictureUrl] = useState('');
  useEffect(() => {
    const fetchLiffId = async () => {
      try {
        const response = await fetch('/api/liff-id');
        const data = await response.json();
        const liffId = data.liffId;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const profile = await liff.getProfile();
          setUserId(profile.userId);
          setPictureUrl(profile.pictureUrl || '');
        }
      } catch (error) {
        console.error('LIFF initialization failed', error);
      }
    };
    fetchLiffId();
  }, []);
  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/registerUser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          name,
          nickname,
          department,
          employeeNumber,
        }),
      });
      if (response.ok) {
        setMessage('Registration successful!');
        liff.closeWindow();
      } else {
        setMessage('Registration failed.');
      }
    } catch (error) {
      console.error('Error during registration:', error);
      setMessage('Error occurred during registration.');
    }
  };
  return (
    <div className="container bg-white p-6 rounded-lg shadow-lg w-full max-w-md text-center">
      <div className="flex justify-center mb-4">
        {pictureUrl ? (
          <img
            src={pictureUrl}
            alt="Line Profile"
            className="w-20 h-20 rounded-full object-cover"
          />
        ) : (
          <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-gray-600">Line Picture Profile</span>
          </div>
        )}
      </div>
      <h1 className="text-2xl font-bold mb-4">ลงทะเบียนพนักงาน</h1>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="name" className="block text-gray-700 font-bold mb-2">
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="nickname"
            className="block text-gray-700 font-bold mb-2"
          >
            Nickname
          </label>
          <input
            type="text"
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="department"
            className="block text-gray-700 font-bold mb-2"
          >
            Department
          </label>
          <input
            type="text"
            id="department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="employeeNumber"
            className="block text-gray-700 font-bold mb-2"
          >
            Employee Number
          </label>
          <input
            type="text"
            id="employeeNumber"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Register
        </button>
        {message && <p className="mt-4 text-red-500">{message}</p>}
      </form>
    </div>
  );
};
export default RegisterForm;
