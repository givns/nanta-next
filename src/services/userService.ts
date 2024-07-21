// In services/userService.ts

import axios from 'axios';

export const getUserData = async (userId: string) => {
  try {
    const response = await axios.get(`/api/user/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
};
