//services/location/EnhancedLocationService.ts

import {
  LocationConfidence,
  LocationVerificationState,
} from '@/types/attendance';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface LocationResult
  extends Omit<LocationVerificationState, 'coordinates'> {
  timestamp: number;
  coordinates: LocationPoint | null;
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
  backupPoints: LocationPoint[];
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

  private lastLocation: LocationVerificationState | null = null;
  private locationHistory: LocationHistory[] = [];

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
      const backupDistances = premise.backupPoints.map((point) =>
        this.calculateDistance(lat, lng, point.lat, point.lng),
      );
      const allDistances = [mainDistance, ...backupDistances];
      const minDistance = Math.min(...allDistances);

      let confidence: 'high' | 'medium' | 'low';
      let inPremises = false;

      if (minDistance <= premise.radius + Math.min(accuracy, 30)) {
        confidence = 'high';
        inPremises = true;
      } else if (minDistance <= premise.radius + Math.min(accuracy, 50)) {
        const backupConfirmations = backupDistances.filter(
          (d) => d <= premise.radius + Math.min(accuracy, 50),
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
          (d) => d <= premise.radius + accuracy,
        ).length,
        inPremises,
      };
    });

    return results.reduce((best, current) => {
      if (best.confidence !== current.confidence) {
        const confidenceMap = { high: 3, medium: 2, low: 1 };
        return confidenceMap[current.confidence] >
          confidenceMap[best.confidence]
          ? current
          : best;
      }
      if (best.inPremises !== current.inPremises) {
        return current.inPremises ? current : best;
      }
      return current.distance < best.distance ? current : best;
    });
  }

  private validateWithHistory(
    result: LocationVerificationState,
  ): LocationVerificationState {
    const locationResult = this.verificationStateToResult(result);
    if (!locationResult.inPremises && this.locationHistory.length >= 2) {
      const recentHistory = this.locationHistory
        .slice(-3)
        .filter((h) => Date.now() - h.timestamp < 5 * 60 * 1000);

      const validLocations = recentHistory.filter(
        (h) =>
          h.result.inPremises &&
          h.result.confidence !== 'low' &&
          h.result.confidence !== 'manual',
      );

      if (validLocations.length >= 2) {
        const confidenceMap: Record<LocationConfidence, number> = {
          high: 3,
          medium: 2,
          low: 1,
          manual: 0,
        };

        const bestHistoricalResult = validLocations.reduce((best, current) => {
          if (!best) return current;
          return confidenceMap[current.result.confidence] >
            confidenceMap[best.result.confidence]
            ? current
            : best;
        });

        const validatedResult = {
          ...locationResult,
          inPremises: true,
          confidence: 'medium' as const,
          address: bestHistoricalResult.result.address,
        };
        return this.locationResultToVerificationState(validatedResult);
      }
    }
    return result;
  }

  private addToHistory(state: LocationVerificationState) {
    const result = this.verificationStateToResult(state);
    this.locationHistory.push({
      timestamp: Date.now(),
      result,
    });

    if (this.locationHistory.length > EnhancedLocationService.HISTORY_SIZE) {
      this.locationHistory.shift();
    }
  }

  async getCurrentLocation(
    forceRefresh = false,
  ): Promise<LocationVerificationState> {
    // Check cache first
    if (
      !forceRefresh &&
      this.lastLocation &&
      Date.now() - this.verificationStateToResult(this.lastLocation).timestamp <
        EnhancedLocationService.LOCATION_CACHE_TIME
    ) {
      return this.lastLocation;
    }

    let attempts = 0;
    let bestResult: LocationVerificationState | null = null;

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

        // Handle low accuracy
        if (accuracy > EnhancedLocationService.MIN_ACCURACY) {
          if (attempts < EnhancedLocationService.MAX_RETRIES - 1) {
            console.log('Low accuracy, retrying...', {
              accuracy,
              attempt: attempts + 1,
            });
            attempts++;
            await new Promise((resolve) =>
              setTimeout(resolve, EnhancedLocationService.RETRY_DELAY),
            );
            continue;
          }

          const lowAccuracyState: LocationVerificationState = {
            status: 'error',
            verificationStatus: 'needs_verification',
            inPremises: false,
            address: '',
            confidence: 'low',
            accuracy,
            coordinates: { lat: latitude, lng: longitude },
            error: 'ความแม่นยำของตำแหน่งต่ำเกินไป กรุณาลองใหม่อีกครั้ง',
            triggerReason: 'Low accuracy',
          };

          console.log('Low accuracy limit reached:', lowAccuracyState);
          this.lastLocation = lowAccuracyState;
          return lowAccuracyState;
        }

        // Check location against premises
        const analysis = this.analyzePremisesProbability(
          latitude,
          longitude,
          accuracy,
        );
        const currentState: LocationVerificationState = {
          status: 'ready',
          verificationStatus: analysis.inPremises
            ? 'verified'
            : 'needs_verification',
          inPremises: analysis.inPremises,
          address: analysis.premise.name,
          confidence: analysis.confidence,
          accuracy,
          coordinates: { lat: latitude, lng: longitude },
          error: null,
          triggerReason: analysis.inPremises ? null : 'Out of premises',
        };

        if (!bestResult || currentState.accuracy < bestResult.accuracy) {
          bestResult = currentState;
        }

        if (currentState.inPremises || currentState.accuracy < 30) {
          const validatedState = this.validateWithHistory(currentState);
          this.lastLocation = validatedState;
          this.addToHistory(validatedState);
          console.log('Location verified:', validatedState);
          return validatedState;
        }

        attempts++;
        if (attempts < EnhancedLocationService.MAX_RETRIES) {
          console.log('Location not in premises, retrying...', {
            attempt: attempts + 1,
          });
          await new Promise((resolve) =>
            setTimeout(resolve, EnhancedLocationService.RETRY_DELAY),
          );
        }
      } catch (error) {
        console.error('Location fetch error:', error);

        // Handle permission denied immediately
        if (error instanceof GeolocationPositionError && error.code === 1) {
          const permissionDeniedState: LocationVerificationState = {
            status: 'error',
            verificationStatus: 'needs_verification',
            inPremises: false,
            address: '',
            confidence: 'low',
            accuracy: 0,
            coordinates: undefined,
            error:
              'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น กรุณาเปิดการใช้งาน Location Services',
            triggerReason: 'Location permission denied',
          };

          console.log('Permission denied:', permissionDeniedState);
          this.lastLocation = permissionDeniedState;
          return permissionDeniedState;
        }

        // For other errors, try retry
        if (attempts < EnhancedLocationService.MAX_RETRIES - 1) {
          console.log('Location error, retrying...', {
            attempt: attempts + 1,
            error,
          });
          attempts++;
          await new Promise((resolve) =>
            setTimeout(resolve, EnhancedLocationService.RETRY_DELAY),
          );
          continue;
        }

        // Return cached location if recent
        if (
          this.lastLocation &&
          Date.now() -
            this.verificationStateToResult(this.lastLocation).timestamp <
            5 * 60 * 1000
        ) {
          console.log('Using recent cached location:', this.lastLocation);
          return this.lastLocation;
        }

        // Final error state
        const errorState: LocationVerificationState = {
          status: 'error',
          verificationStatus: 'needs_verification',
          inPremises: false,
          address: '',
          confidence: 'low',
          accuracy: 0,
          coordinates: undefined,
          error: 'เกิดข้อผิดพลาดในการระบุตำแหน่ง กรุณาลองใหม่อีกครั้ง',
          triggerReason: 'Maximum retries exceeded',
        };

        console.log('Max retries reached with error:', errorState);
        this.lastLocation = errorState;
        return errorState;
      }
    }

    // Use best result if available after all attempts
    if (bestResult) {
      const validatedState = this.validateWithHistory(bestResult);
      this.lastLocation = validatedState;
      this.addToHistory(validatedState);
      console.log('Using best available result:', validatedState);
      return validatedState;
    }

    // Final fallback error state
    const fallbackState: LocationVerificationState = {
      status: 'error',
      verificationStatus: 'needs_verification',
      inPremises: false,
      address: '',
      confidence: 'low',
      accuracy: 0,
      coordinates: undefined,
      error: 'ไม่สามารถระบุตำแหน่งได้หลังจากลองหลายครั้ง กรุณาลองใหม่อีกครั้ง',
      triggerReason: 'No valid location found',
    };

    console.log('No valid location found:', fallbackState);
    this.lastLocation = fallbackState;
    return fallbackState;
  }

  private locationResultToVerificationState(
    result: LocationResult,
  ): LocationVerificationState {
    const { timestamp, ...rest } = result;
    return {
      ...rest,
      coordinates: result.coordinates || undefined,
    };
  }

  private verificationStateToResult(
    state: LocationVerificationState,
  ): LocationResult {
    return {
      ...state,
      timestamp: Date.now(),
      coordinates: state.coordinates || null,
    };
  }

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
}
