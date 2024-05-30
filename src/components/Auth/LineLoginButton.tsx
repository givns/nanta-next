// src/components/Auth/LineLoginButton.tsx
import React from 'react';
import liff from '@line/liff';

const LineLoginButton: React.FC = () => {
  const handleLogin = () => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      console.error('LIFF ID is not defined');
      return;
    }
    liff.init({ liffId }).then(() => {
      if (!liff.isLoggedIn()) {
        liff.login();
      }
    });
  };

  return (
    <button onClick={handleLogin} className="bg-green-500 text-white p-2 rounded">
      Login with LINE
    </button>
  );
};

export default LineLoginButton;