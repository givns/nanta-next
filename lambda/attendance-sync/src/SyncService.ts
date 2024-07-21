import {
  saveDataOffline,
  getDataOffline,
  removeDataOffline,
} from './offlineService';

const syncDataType = async (dataType: string, endpoint: string) => {
  const data = await getDataOffline(dataType);
  if (data) {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await removeDataOffline(dataType);
      console.log(`Successfully synced ${dataType} data`);
    } catch (error) {
      console.error(`Failed to sync ${dataType} data:`, error);
    }
  }
};

export const syncData = async () => {
  await syncDataType('checkIn', '/api/checkIn');
  await syncDataType('checkpoint', '/api/checkpoint');
  await syncDataType('checkOut', '/api/checkOut');
};

const isOnline = (): boolean => {
  return window.navigator.onLine;
};

export const initializeSyncService = () => {
  window.addEventListener('online', () => {
    console.log('Connection restored. Syncing offline data...');
    syncData();
  });

  if (isOnline()) {
    syncData();
  }
};

export const saveData = async (dataType: string, data: any) => {
  if (isOnline()) {
    try {
      await fetch(`/api/${dataType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      console.log(`Data sent to server successfully for ${dataType}`);
    } catch (error) {
      console.error(`Failed to send data to server for ${dataType}:`, error);
      saveDataOffline(dataType, data);
    }
  } else {
    saveDataOffline(dataType, data);
  }
};
