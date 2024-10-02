import liff from '@line/liff';

type Profile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

// Function to get the user profile from LIFF
export const getProfile = async (): Promise<Profile | null> => {
  try {
    if (liff.isLoggedIn()) {
      return await liff.getProfile();
    } else {
      console.warn('User is not logged in');
      return null;
    }
  } catch (error) {
    console.error('Failed to get profile', error);
    return null;
  }
};
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

// Function to close the LIFF window
export const closeWindow = (): void => {
  if (liff.isInClient()) {
    liff.closeWindow();
  } else {
    console.warn('Not in LINE client, cannot close window');
  }
};

// TypeScript type for LIFF Profile
export type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};
