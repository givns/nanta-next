//services/location/EnhancedLocationService.ts

interface LocationPoint {
  lat: number;
  lng: number;
}

interface Premise {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  backupPoints: LocationPoint[];
}

interface LocationResult {
  inPremises: boolean;
  address: string;
  accuracy: number;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
  coordinates: LocationPoint;
}

interface LocationHistory {
  timestamp: number;
  result: LocationResult;
}

interface PremiseAnalysis {
  premise: Premise;
  distance: number;
  confidence: 'high' | 'medium' | 'low';
  backupConfirmations: number;
  inPremises: boolean;
}

export class EnhancedLocationService {
  private static readonly LOCATION_CACHE_TIME = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_DELAY = 2000;
  private static readonly MIN_ACCURACY = 100; // meters
  private static readonly HISTORY_SIZE = 5;
  private static readonly PREMISES: Premise[] = [
    {
      name: 'บริษัท นันตา ฟู้ด',
      lat: 13.50821,
      lng: 100.76405,
      radius: 50,
      backupPoints: [
        { lat: 13.50825, lng: 100.764 },
        { lat: 13.50818, lng: 100.7641 },
      ],
    },
    {
      name: 'บริษัท ปัตตานี ฟู้ด',
      lat: 13.51444,
      lng: 100.70922,
      radius: 50,
      backupPoints: [
        { lat: 13.5144, lng: 100.70925 },
        { lat: 13.51448, lng: 100.70918 },
      ],
    },
    {
      name: 'สำนักงานใหญ่',
      lat: 13.747920392683099,
      lng: 100.63441771348242,
      radius: 50,
      backupPoints: [
        { lat: 13.747925, lng: 100.63442 },
        { lat: 13.747915, lng: 100.63441 },
      ],
    },
  ];

  private lastLocation: LocationResult | null = null;
  private locationHistory: LocationHistory[] = [];

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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

  private analyzePremisesProbability(
    lat: number,
    lng: number,
    accuracy: number,
  ): PremiseAnalysis {
    const results = EnhancedLocationService.PREMISES.map((premise) => {
      const mainDistance = this.calculateDistance(
        lat,
        lng,
        premise.lat,
        premise.lng,
      );
      const backupDistances = premise.backupPoints.map((point: LocationPoint) =>
        this.calculateDistance(lat, lng, point.lat, point.lng),
      );
      const allDistances = [mainDistance, ...backupDistances];
      const minDistance = Math.min(...allDistances);

      let confidence: 'high' | 'medium' | 'low';
      let inPremises = false;

      // Determine confidence and premises status
      if (minDistance <= premise.radius + Math.min(accuracy, 30)) {
        confidence = 'high';
        inPremises = true;
      } else if (minDistance <= premise.radius + Math.min(accuracy, 50)) {
        const backupConfirmations = backupDistances.filter(
          (d: number) => d <= premise.radius + Math.min(accuracy, 50),
        ).length;
        confidence = backupConfirmations >= 1 ? 'medium' : 'low';
        inPremises = backupConfirmations >= 1;
      } else {
        confidence = 'low';
        inPremises = false;
      }

      return {
        premise,
        distance: minDistance,
        confidence,
        backupConfirmations: backupDistances.filter(
          (d: number) => d <= premise.radius + accuracy,
        ).length,
        inPremises,
      };
    });

    results.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        const confidenceMap = { high: 3, medium: 2, low: 1 };
        return confidenceMap[b.confidence] - confidenceMap[a.confidence];
      }
      if (a.inPremises !== b.inPremises) {
        return b.inPremises ? 1 : -1;
      }
      return a.distance - b.distance;
    });

    return results[0];
  }

  private addToHistory(result: LocationResult) {
    this.locationHistory.push({
      timestamp: Date.now(),
      result,
    });

    if (this.locationHistory.length > EnhancedLocationService.HISTORY_SIZE) {
      this.locationHistory.shift();
    }
  }

  private validateWithHistory(result: LocationResult): LocationResult {
    if (!result.inPremises && this.locationHistory.length >= 2) {
      const recentHistory = this.locationHistory
        .slice(-3)
        .filter((h) => Date.now() - h.timestamp < 5 * 60 * 1000);

      const validLocations = recentHistory.filter(
        (h) => h.result.inPremises && h.result.confidence !== 'low',
      );

      if (validLocations.length >= 2) {
        const bestHistoricalResult = validLocations.reduce((best, current) => {
          if (!best) return current;
          const confidenceMap = { high: 3, medium: 2, low: 1 };
          return confidenceMap[current.result.confidence] >
            confidenceMap[best.result.confidence]
            ? current
            : best;
        });

        return {
          ...result,
          inPremises: true,
          confidence: 'medium', // Downgrade to medium when using history
          address: bestHistoricalResult.result.address,
        };
      }
    }
    return result;
  }

  async getCurrentLocation(forceRefresh = false): Promise<LocationResult> {
    let attempts = 0;
    let bestResult: LocationResult | null = null;

    while (attempts < EnhancedLocationService.MAX_RETRIES) {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: attempts === 0 ? 10000 : 15000,
              maximumAge: forceRefresh ? 0 : 5000,
            });
          },
        );

        const { latitude, longitude, accuracy } = position.coords;

        if (accuracy > EnhancedLocationService.MIN_ACCURACY) {
          throw new Error('Location accuracy too low');
        }

        const analysis = this.analyzePremisesProbability(
          latitude,
          longitude,
          accuracy,
        );
        const result: LocationResult = {
          inPremises: analysis.inPremises,
          address: analysis.premise.name,
          accuracy,
          timestamp: Date.now(),
          confidence: analysis.confidence,
          coordinates: { lat: latitude, lng: longitude },
        };

        if (!bestResult || result.accuracy < bestResult.accuracy) {
          bestResult = result;
        }

        if (result.inPremises || result.accuracy < 30) {
          this.lastLocation = result;
          this.addToHistory(result);
          return this.validateWithHistory(result);
        }

        attempts++;
        if (attempts < EnhancedLocationService.MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, EnhancedLocationService.RETRY_DELAY),
          );
        }
      } catch (error) {
        attempts++;
        if (attempts < EnhancedLocationService.MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, EnhancedLocationService.RETRY_DELAY),
          );
          continue;
        }

        if (
          this.lastLocation &&
          Date.now() - this.lastLocation.timestamp < 5 * 60 * 1000
        ) {
          return this.lastLocation;
        }

        throw error;
      }
    }

    if (bestResult) {
      this.lastLocation = bestResult;
      this.addToHistory(bestResult);
      return this.validateWithHistory(bestResult);
    }

    throw new Error('Failed to get accurate location');
  }
}
