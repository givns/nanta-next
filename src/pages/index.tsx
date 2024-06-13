// pages/index.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';

const Home = () => {
  const router = useRouter();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const path = urlParams.get('path');

    if (path && router.pathname !== path) {
      router.push(path);
    }
  }, [router]);

  return null;
};

export default Home;
