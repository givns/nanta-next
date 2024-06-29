import liff from '@line/liff';

const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

export const initializeLiff = async (): Promise<void> => {
  try {
    if (!liffId) {
      throw new Error('LIFF ID is not defined');
    }
    await liff.init({ liffId });
    console.log('LIFF initialization succeeded');
  } catch (error) {
    console.error('LIFF initialization failed', error);
    throw error;
  }
};

export const getLiffProfile = async () => {
  if (!liff.isLoggedIn()) {
    liff.login();
  }
  return await liff.getProfile();
};

export { liff };
