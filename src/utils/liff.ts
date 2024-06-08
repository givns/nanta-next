import liff from '@line/liff';

export const initializeLiff = async () => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  if (!liffId) {
    throw new Error('NEXT_PUBLIC_LIFF_ID is not defined');
  }

  try {
    await liff.init({ liffId });
    console.log('LIFF initialized');
  } catch (error) {
    console.error('LIFF initialization failed', error);
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