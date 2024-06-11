import { getProfile } from '../services/liff';

// Function to get user details from LIFF
export const getUserDetails = async (): Promise<{
  userId: string;
  pictureUrl: string;
}> => {
  const profile = await getProfile();
  if (profile) {
    return {
      userId: profile.userId,
      pictureUrl: profile.pictureUrl || '',
    };
  } else {
    throw new Error('Failed to get user profile');
  }
};
