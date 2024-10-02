// contexts/LiffContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import liff from '@line/liff';

const LiffContext = createContext<typeof liff | null>(null);

export const useLiff = () => {
  const context = useContext(LiffContext);
  if (context === undefined) {
    throw new Error('useLiff must be used within a LiffProvider');
  }
  return context;
};

export const LiffProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [liffObject, setLiffObject] = useState<typeof liff | null>(null);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        setLiffObject(liff);
      } catch (error) {
        console.error('LIFF initialization failed', error);
      }
    };

    initLiff();
  }, []);

  return (
    <LiffContext.Provider value={liffObject}>{children}</LiffContext.Provider>
  );
};
