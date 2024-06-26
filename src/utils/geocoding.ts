import axios from 'axios';

export async function getAddressFromCoordinates(
  lat: number,
  lon: number,
): Promise<string> {
  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
    );

    if (response.data && response.data.display_name) {
      return response.data.display_name;
    } else {
      throw new Error('Unable to get address from coordinates');
    }
  } catch (error) {
    console.error('Error in getAddressFromCoordinates:', error);
    return 'Address not found';
  }
}
