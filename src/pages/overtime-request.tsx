import React from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import { useLiff } from '../contexts/LiffContext';

const OvertimeRequestPage: React.FC = () => {
  const liff = typeof window !== 'undefined' ? useLiff() : null;

  // During static generation, return a placeholder or loading state
  if (typeof window === 'undefined') {
    return <div>Loading...</div>;
  }

  if (!liff) {
    return <div>Loading LIFF...</div>;
  }

  return (
    <div className="overtime-request-page">
      <OvertimeRequestForm liff={liff} />
    </div>
  );
};

export default OvertimeRequestPage;
