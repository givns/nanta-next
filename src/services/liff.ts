import liff from '@line/liff';

// Function to initialize LIFF
export const initializeLiff = async (liffId: string): Promise<void> => {
  try {
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
    }
  } catch (error) {
    console.error('LIFF initialization failed', error);
  }
};

// Function to get the user profile from LIFF
export const getProfile = async (): Promise<liff.Profile | null> => {
  try {
    return await liff.getProfile();
  } catch (error) {
    console.error('Failed to get profile', error);
    return null;
  }
};

// Function to close the LIFF window
export const closeWindow = (): void => {
  liff.closeWindow();
};
