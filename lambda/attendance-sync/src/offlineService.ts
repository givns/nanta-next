import localforage from 'localforage';

export const saveDataOffline = async (key: string, data: any) => {
  try {
    const existingData = (await localforage.getItem<any[]>(key)) || [];
    existingData.push(data);
    await localforage.setItem(key, existingData);
    console.log(`Data saved offline successfully for ${key}`);
  } catch (error) {
    console.error(`Failed to save data offline for ${key}:`, error);
  }
};

export const getDataOffline = async (key: string) => {
  try {
    const data = await localforage.getItem<any[]>(key);
    return data;
  } catch (error) {
    console.error(
      `Failed to retrieve data from offline storage for ${key}:`,
      error,
    );
    return null;
  }
};

export const removeDataOffline = async (key: string) => {
  try {
    await localforage.removeItem(key);
    console.log(`Data removed from offline storage successfully for ${key}`);
  } catch (error) {
    console.error(
      `Failed to remove data from offline storage for ${key}:`,
      error,
    );
  }
};
