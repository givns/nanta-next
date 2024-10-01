import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import liff from '@line/liff';

const LiffContext = createContext<typeof liff | null>(null);

export const useLiff = () => {
  const context = useContext(LiffContext);
  if (!context) {
    throw new Error('useLiff must be used within a LiffProvider');
  }
  return context;
};

interface LiffProviderProps {
  children: ReactNode;
}

export const LiffProvider: React.FC<LiffProviderProps> = ({ children }) => {
  const [liffObject, setLiffObject] = useState<typeof liff | null>(null);

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
        setLiffObject(liff);
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };

    initializeLiff();
  }, []);

  return (
    <LiffContext.Provider value={liffObject}>{children}</LiffContext.Provider>
  );
};
