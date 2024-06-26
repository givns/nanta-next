import axios from 'axios';

export const getAddressFromCoordinates = async (
  lat: number,
  lon: number,
): Promise<string> => {
  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse`,
      {
        params: {
          format: 'json',
          lat,
          lon,
          zoom: 18,
          addressdetails: 1,
        },
      },
    );
    // Process the response and return the address
    return response.data.display_name || 'Address not found';
  } catch (error) {
    console.error('Error fetching address:', error);
    return 'Unable to fetch address';
  }
};
