// pages/check-in.tsx

import React from 'react';
import EnhancedCheckInForm from '../components/EnhancedCheckInForm';

const CheckInPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Employee Check-In</h1>
      <EnhancedCheckInForm />
    </div>
  );
};

export default CheckInPage;
