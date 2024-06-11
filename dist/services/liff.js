import liff from '@line/liff';
// Function to initialize LIFF
export const initializeLiff = async (liffId) => {
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
export const getProfile = async () => {
  try {
    return await liff.getProfile();
  } catch (error) {
    console.error('Failed to get profile', error);
    return null;
  }
};
// Function to close the LIFF window
export const closeWindow = () => {
  liff.closeWindow();
};
