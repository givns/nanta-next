// utils/liff.ts
import liff from '@line/liff';

let liffInitialized = false;

export const initializeLiff = async () => {
  if (!liffInitialized) {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (liffId) {
      await liff.init({ liffId });
      liffInitialized = true;
      console.log('LIFF initialized');
    } else {
      console.error('LIFF ID is not defined');
    }
  }
};

export const getLiffProfile = async () => {
  if (!liff.isLoggedIn()) {
    liff.login();
  } else {
    const profile = await liff.getProfile();
    return profile;
  }
};
