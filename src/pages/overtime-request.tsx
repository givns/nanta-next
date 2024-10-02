import { useEffect, useState } from 'react';
import OvertimeRequestForm from '../components/OvertimeRequestForm';
import liff from '@line/liff';

const OvertimeRequestPage: React.FC = () => {
  const [isLiffReady, setIsLiffReady] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
        if (!liff.isLoggedIn()) {
          await liff.init({
            liffId: process.env.NEXT_PUBLIC_LIFF_ID as string,
          });
        }
        setIsLiffReady(true);
        console.log('LIFF initialized in CheckInRouter');
      } catch (error) {
        console.error('Failed to initialize LIFF in CheckInRouter:', error);
      }
    };

    initLiff();
  }, []);

  if (!isLiffReady) {
    return <div>Initializing LIFF...</div>;
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
