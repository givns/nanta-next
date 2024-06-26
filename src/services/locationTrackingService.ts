import axios from 'axios';

interface LocationData {
  latitude: number;
  longitude: number;
  timestamp: number;
}

class LocationTrackingService {
  private batchSize: number = 5;
  private updateInterval: number = 30 * 60 * 1000; // 30 minutes
  private locationBatch: LocationData[] = [];
  private watchId: number | null = null;
  private trackingSessionId: string | null = null;

  async startTracking(userId: string) {
    try {
      const response = await axios.post('/api/startTracking', { userId });
      this.trackingSessionId = response.data.trackingSessionId;
      this.watchPosition();
      this.startBatchSending();
    } catch (error) {
      console.error('Failed to start tracking session:', error);
    }
  }

  async stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    await this.sendBatchToServer(); // Send any remaining data
    if (this.trackingSessionId) {
      await axios.post('/api/stopTracking', {
        trackingSessionId: this.trackingSessionId,
      });
      this.trackingSessionId = null;
    }
  }

  private watchPosition() {
    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        this.handlePositionUpdate,
        this.handlePositionError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    }
  }

  private handlePositionUpdate = (position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords;
    this.locationBatch.push({ latitude, longitude, timestamp: Date.now() });

    if (this.locationBatch.length >= this.batchSize) {
      this.sendBatchToServer();
    }
  };

  private handlePositionError = (error: GeolocationPositionError) => {
    console.error('Geolocation error:', error.message);
  };

  private startBatchSending() {
    setInterval(() => this.sendBatchToServer(), this.updateInterval);
  }

  private async sendBatchToServer() {
    if (this.locationBatch.length === 0 || !this.trackingSessionId) return;

    try {
      await axios.post('/api/updateLocations', {
        trackingSessionId: this.trackingSessionId,
        locations: this.locationBatch,
      });
      this.locationBatch = []; // Clear the batch after successful send
    } catch (error) {
      console.error('Failed to send locations to server:', error);
    }
  }

  async getCurrentLocation(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: Date.now(),
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }
}

export const locationTrackingService = new LocationTrackingService();
