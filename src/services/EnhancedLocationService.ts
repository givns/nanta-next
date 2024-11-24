// services/EnhancedLocationService.ts
import { useState, useRef, useCallback } from 'react';

interface LocationResult {
  inPremises: boolean;
  address: string;
  accuracy: number;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
  coordinates: {
    lat: number;
    lng: number;
  };
}

interface LocationHistory {
  timestamp: number;
  result: LocationResult;
}

interface Premise {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  backupPoints: { lat: number; lng: number }[];
}

export class EnhancedLocationService {
  private static readonly LOCATION_CACHE_TIME = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 5; // Increased retries
  private static readonly RETRY_DELAY = 2000;
  private static readonly MIN_ACCURACY = 100; // meters
  private static readonly HISTORY_SIZE = 5;
  private static readonly CONFIDENCE_THRESHOLD = 0.7;
  private static readonly PREMISES: Premise[] = [
    { 
      name: 'บริษัท นันตา ฟู้ด', 
      lat: 13.50821, 
      lng: 100.76405, 
      radius: 50,
      backupPoints: [
        { lat: 13.50825, lng: 100.76400 },
        { lat: 13.50818, lng: 100.76410 }
      ]
    },
    { 
      name: 'บริษัท ปัตตานี ฟู้ด', 
      lat: 13.51444, 
      lng: 100.70922, 
      radius: 50,
      backupPoints: [
        { lat: 13.51440, lng: 100.70925 },
        { lat: 13.51448, lng: 100.70918 }
      ]
    },
    {
      name: 'สำนักงานใหญ่',
      lat: 13.747920392683099,
      lng: 100.63441771348242,
      radius: 50,
      backupPoints: [
        { lat: 13.747925, lng: 100.634420 },
        { lat: 13.747915, lng: 100.634410 }
      ]
    },
  ];

  private lastLocation: LocationResult | null = null;
  private locationHistory: LocationHistory[] = [];
  private watchId: number | null = null;
  private highAccuracyFailed = false;

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private addToHistory(result: LocationResult) {
    this.locationHistory.push({
      timestamp: Date.now(),
      result
    });

    if (this.locationHistory.length > EnhancedLocationService.HISTORY_SIZE) {
      this.locationHistory.shift();
    }
  }

  private getConfidenceLevel(distances: number[], accuracy: number): 'high' | 'medium' | 'low' {
    const minDistance = Math.min(...distances);
    if (minDistance <= accuracy && accuracy < 50) return 'high';
    if (minDistance <= accuracy + 25 && accuracy < 75) return 'medium';
    return 'low';
  }

  private isWithinPremiseWithBackup(
    lat: number, 
    lng: number, 
    accuracy: number, 
    premise: Premise
  ): boolean {
    // Check main location
    const mainDistance = this.calculateDistance(lat, lng, premise.lat, premise.lng);
    if (mainDistance <= premise.radius + accuracy) return true;

    // Check backup points with increasing tolerance
    return premise.backupPoints.some((point, index) => {
      const backupDistance = this.calculateDistance(lat, lng, point.lat, point.lng);
      const adjustedRadius = premise.radius + accuracy + (index * 10); // Increase tolerance for each backup point
      return backupDistance <= adjustedRadius;
    });
  }

  private analyzePremisesProbability(lat: number, lng: number, accuracy: number) {
    const results = EnhancedLocationService.PREMISES.map(premise => {
      const mainDistance = this.calculateDistance(lat, lng, premise.lat, premise.lng);
      const backupDistances = premise.backupPoints.map(point =>
        this.calculateDistance(lat, lng, point.lat, point.lng)
      );
      const allDistances = [mainDistance, ...backupDistances];
      const minDistance = Math.min(...allDistances);
      
      return {
        premise,
        distance: minDistance,
        confidence: this.getConfidenceLevel([minDistance], accuracy)
      };
    });

    // Sort by distance and confidence
    results.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return a.confidence === 'high' ? -1 : b.confidence === 'high' ? 1 : 0;
      }
      return a.distance - b.distance;
    });

    return results[0];
  }

  private async getLocationWithRetry(
    options: PositionOptions
  ): Promise<GeolocationPosition> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < EnhancedLocationService.MAX_RETRIES) {
      try {
        return await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
      } catch (error) {
        lastError = error as Error;
        attempts++;
        if (attempts < EnhancedLocationService.MAX_RETRIES) {
          await new Promise(resolve => 
            setTimeout(resolve, EnhancedLocationService.RETRY_DELAY * attempts)
          );
        }
      }
    }

    throw lastError || new Error('Failed to get location after retries');
  }

  public startWatching() {
    if (this.watchId !== null) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const result = this.analyzePremisesProbability(latitude, longitude, accuracy);
        
        if (result.confidence !== 'low') {
          this.lastLocation = {
            inPremises: true,
            address: result.premise.name,
            accuracy,
            timestamp: Date.now(),
            confidence: result.confidence,
            coordinates: { lat: latitude, lng: longitude }
          };
          this.addToHistory(this.lastLocation);
        }
      },
      () => {}, // Ignore errors in watch
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  public stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  async getCurrentLocation(forceRefresh = false): Promise<LocationResult> {
    // Check cache if not forcing refresh
    if (!forceRefresh && 
        this.lastLocation && 
        Date.now() - this.lastLocation.timestamp < EnhancedLocationService.LOCATION_CACHE_TIME) {
      return this.lastLocation;
    }

    try {
      // Try high accuracy first
      const position = await this.getLocationWithRetry({
        enableHighAccuracy: !this.highAccuracyFailed,
        timeout: this.highAccuracyFailed ? 15000 : 10000,
        maximumAge: forceRefresh ? 0 : 5000,
      });

      const { latitude, longitude, accuracy } = position.coords;
      
      // Analyze location probability
      const bestMatch = this.analyzePremisesProbability(latitude, longitude, accuracy);
      
      // Create result
      const result: LocationResult = {
        inPremises: bestMatch.confidence !== 'low',
        address: bestMatch.premise.name,
        accuracy,
        timestamp: Date.now(),
        confidence: bestMatch.confidence,
        coordinates: { lat: latitude, lng: longitude }
      };

      // Store in history
      this.addToHistory(result);
      this.lastLocation = result;

      // If we got a good result, start watching for updates
      if (result.confidence !== 'low') {
        this.startWatching();
      }

      return result;

    } catch (error) {
      // If high accuracy fails, try again with low accuracy
      if (!this.highAccuracyFailed) {
        this.highAccuracyFailed = true;
        return this.getCurrentLocation(forceRefresh);
      }

      // If we have recent history, use the most confident result
      const recentHistory = this.locationHistory.filter(
        h => Date.now() - h.timestamp < 5 * 60 * 1000 // Last 5 minutes
      );

      if (recentHistory.length > 0) {
        const mostConfident = recentHistory.reduce((best, current) => {
          const confidenceMap = { high: 3, medium: 2, low: 1 };
          return confidenceMap[current.result.confidence] > confidenceMap[best.result.confidence]
            ? current
            : best;
        });

        return {
          ...mostConfident.result,
          timestamp: Date.now(),
          confidence: 'low' // Downgrade confidence since we're using history
        };
      }

      throw error;
    }
  }

  // New method to validate current location status
  async validateLocationStatus(): Promise<boolean> {
    try {
      const result = await this.getCurrentLocation(true);
      
      // If we have high confidence, trust the result
      if (result.confidence === 'high') {
        return result.inPremises;
      }

      // For medium/low confidence, check recent history
      const recentHistory = this.locationHistory
        .filter(h => Date.now() - h.timestamp < 5 * 60 * 1000)
        .map(h => h.result);

      if (recentHistory.length >= 3) {
        const positiveResults = recentHistory.filter(r => r.inPremises).length;
        return positiveResults / recentHistory.length >= EnhancedLocationService.CONFIDENCE_THRESHOLD;
      }

      return result.inPremises;
    } catch (error) {
      console.error('Location validation error:', error);
      return false;
    }
  }
}