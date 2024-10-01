import React from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import { useLiff } from '../contexts/LiffContext';

const OvertimeRequestPage: React.FC = () => {
  const liff = useLiff();

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
