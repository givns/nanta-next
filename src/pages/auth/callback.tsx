import { useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import liff from '@line/liff';

interface Profile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

const Callback: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      console.error('LIFF ID is not defined');
      return;
    }
    liff.init({ liffId }).then(() => {
      if (liff.isLoggedIn()) {
        liff.getProfile().then((profile: Profile) => {
          axios.post('/api/auth', profile)
            .then(response => {
              // Save user data to local storage or context
              router.push('/dashboard');
            })
            .catch(error => {
              console.error('Error logging in', error);
            });
        });
      }
    });
  }, [router]);

  return <div>Loading...</div>;
};

export default Callback;