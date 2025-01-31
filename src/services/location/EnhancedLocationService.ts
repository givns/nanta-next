// services/location/EnhancedLocationService.ts

import {
  LocationConfidence,
  LocationVerificationState,
  LocationPoint,
  ValidStateTransition,
  STATE_TRANSITIONS,
} from '@/types/attendance';

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
  confidence: LocationConfidence;
  backupConfirmations: number;
  inPremises: boolean;
}

export class EnhancedLocationService {
  private static readonly LOCATION_CACHE_TIME = 30000;
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_DELAY = 2000;
  private static readonly MIN_ACCURACY = 100;
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
  private locationHistory: Array<{
    timestamp: number;
    state: LocationVerificationState;
  }> = [];

  private validateStateTransition(
    from: LocationVerificationState['status'],
    to: LocationVerificationState['status'],
    payload: Partial<LocationVerificationState>,
  ): boolean {
    const transition = STATE_TRANSITIONS[from];
    if (!transition?.to.includes(to)) {
      console.warn(`Invalid transition from ${from} to ${to}`);
      return false;
    }

    const { requiredFields } = transition;
    const isValid = Object.entries(requiredFields).every(
      ([field, required]) =>
        !required ||
        payload[field as keyof LocationVerificationState] !== undefined,
    );

    if (!isValid) {
      console.warn(
        `Missing required fields for transition from ${from} to ${to}`,
        {
          required: requiredFields,
          provided: payload,
        },
      );
    }

    return isValid;
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
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * R;
  }

  private analyzePremisesProbability(
    lat: number,
    lng: number,
    accuracy: number,
  ): PremiseAnalysis {
    return EnhancedLocationService.PREMISES.map((premise) => {
      const mainDistance = this.calculateDistance(
        lat,
        lng,
        premise.lat,
        premise.lng,
      );
      const backupDistances = premise.backupPoints.map((point) =>
        this.calculateDistance(lat, lng, point.lat, point.lng),
      );

      const minDistance = Math.min(mainDistance, ...backupDistances);
      const backupConfirmations = backupDistances.filter(
        (d) => d <= premise.radius + Math.min(accuracy, 50),
      ).length;

      let confidence: LocationConfidence = 'low';
      let inPremises = false;

      if (minDistance <= premise.radius + Math.min(accuracy, 30)) {
        confidence = 'high';
        inPremises = true;
      } else if (minDistance <= premise.radius + Math.min(accuracy, 50)) {
        confidence = backupConfirmations >= 1 ? 'medium' : 'low';
        inPremises = backupConfirmations >= 1;
      }

      return {
        premise,
        distance: minDistance,
        confidence,
        backupConfirmations,
        inPremises,
      };
    }).reduce((best, current) => {
      if (best.confidence !== current.confidence) {
        const confidenceMap = { high: 3, medium: 2, low: 1, manual: 0 };
        return confidenceMap[current.confidence] >
          confidenceMap[best.confidence]
          ? current
          : best;
      }
      return current.distance < best.distance ? current : best;
    });
  }

  private validateWithHistory(
    result: LocationVerificationState,
  ): LocationVerificationState {
    if (!result.inPremises && this.locationHistory.length >= 2) {
      const recentHistory = this.locationHistory
        .filter((h) => Date.now() - h.timestamp < 5 * 60 * 1000)
        .slice(-3);

      const validLocations = recentHistory.filter(
        (h) =>
          h.state.inPremises &&
          h.state.confidence !== 'low' &&
          h.state.confidence !== 'manual',
      );

      if (validLocations.length >= 2) {
        return {
          ...result,
          inPremises: true,
          confidence: 'medium',
          address: validLocations[0].state.address,
          verificationStatus: 'verified',
          triggerReason: null,
        };
      }
    }
    return result;
  }

  private lockedState: LocationVerificationState | null = null;

  lockState(state: LocationVerificationState) {
    this.lockedState = state;
    return () => {
      this.lockedState = null;
    };
  }

  async getCurrentLocation(
    forceRefresh = false,
  ): Promise<LocationVerificationState> {
    if (this.lockedState) {
      return this.lockedState;
    }
    try {
      // Validate initial transition
      if (
        !this.validateStateTransition(
          this.lastLocation?.status ?? 'initializing',
          'loading',
          {},
        )
      ) {
        throw new Error('Invalid initial state transition');
      }

      if (!forceRefresh && this.lastLocation) {
        const cacheAge =
          Date.now() - (this.lastLocation.lastVerifiedAt?.getTime() || 0);
        if (cacheAge < EnhancedLocationService.LOCATION_CACHE_TIME) {
          return this.lastLocation;
        }
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

          if (accuracy > EnhancedLocationService.MIN_ACCURACY) {
            if (attempts < EnhancedLocationService.MAX_RETRIES - 1) {
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
              error: 'ความแม่นยำของตำแหน่งต่ำเกินไป',
              triggerReason: 'Low accuracy',
              lastVerifiedAt: new Date(),
            };

            if (
              !this.validateStateTransition(
                'loading',
                'error',
                lowAccuracyState,
              )
            ) {
              console.warn(
                'Invalid transition to error state for low accuracy',
              );
            }

            this.lastLocation = lowAccuracyState;
            return lowAccuracyState;
          }

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
            lastVerifiedAt: new Date(),
          };

          if (!this.validateStateTransition('loading', 'ready', currentState)) {
            console.warn('Invalid transition to ready state');
          }

          if (!bestResult || currentState.accuracy < bestResult.accuracy) {
            bestResult = currentState;
          }

          if (currentState.inPremises || currentState.accuracy < 30) {
            const validatedState = this.validateWithHistory(currentState);
            this.lastLocation = validatedState;
            this.locationHistory.push({
              timestamp: Date.now(),
              state: validatedState,
            });

            if (
              this.locationHistory.length > EnhancedLocationService.HISTORY_SIZE
            ) {
              this.locationHistory.shift();
            }

            return validatedState;
          }

          attempts++;
          if (attempts < EnhancedLocationService.MAX_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, EnhancedLocationService.RETRY_DELAY),
            );
          }
        } catch (error) {
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
                'ไม่สามารถระบุตำแหน่งได้เนื่องจากการเข้าถึงตำแหน่งถูกปิดกั้น',
              triggerReason: 'Location permission denied',
              lastVerifiedAt: new Date(),
            };

            if (
              !this.validateStateTransition(
                this.lastLocation?.status ?? 'loading',
                'error',
                permissionDeniedState,
              )
            ) {
              console.warn(
                'Invalid transition to error state for permission denied',
              );
            }

            this.lastLocation = permissionDeniedState;
            return permissionDeniedState;
          }

          if (attempts < EnhancedLocationService.MAX_RETRIES - 1) {
            attempts++;
            await new Promise((resolve) =>
              setTimeout(resolve, EnhancedLocationService.RETRY_DELAY),
            );
            continue;
          }

          // Return cached location if recent
          if (
            this.lastLocation &&
            Date.now() - (this.lastLocation.lastVerifiedAt?.getTime() || 0) <
              5 * 60 * 1000
          ) {
            return this.lastLocation;
          }

          const errorState: LocationVerificationState = {
            status: 'error',
            verificationStatus: 'needs_verification',
            inPremises: false,
            address: '',
            confidence: 'low',
            accuracy: 0,
            coordinates: undefined,
            error: 'เกิดข้อผิดพลาดในการระบุตำแหน่ง',
            triggerReason: 'Maximum retries exceeded',
            lastVerifiedAt: new Date(),
          };

          if (
            !this.validateStateTransition(
              this.lastLocation?.status ?? 'loading',
              'error',
              errorState,
            )
          ) {
            console.warn(
              'Invalid transition to error state for retries exceeded',
            );
          }

          this.lastLocation = errorState;
          return errorState;
        }
      }

      // Use best result if available
      if (bestResult) {
        const validatedState = this.validateWithHistory(bestResult);
        this.lastLocation = validatedState;
        this.locationHistory.push({
          timestamp: Date.now(),
          state: validatedState,
        });

        if (
          this.locationHistory.length > EnhancedLocationService.HISTORY_SIZE
        ) {
          this.locationHistory.shift();
        }

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
        error: 'ไม่สามารถระบุตำแหน่งได้หลังจากลองหลายครั้ง',
        triggerReason: 'No valid location found',
        lastVerifiedAt: new Date(),
      };

      if (
        !this.validateStateTransition(
          this.lastLocation?.status ?? 'loading',
          'error',
          fallbackState,
        )
      ) {
        console.warn('Invalid transition to fallback error state');
      }

      this.lastLocation = fallbackState;
      return fallbackState;
    } catch (error) {
      const unexpectedErrorState: LocationVerificationState = {
        status: 'error',
        verificationStatus: 'needs_verification',
        inPremises: false,
        address: '',
        confidence: 'low',
        accuracy: 0,
        coordinates: undefined,
        error:
          error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
        triggerReason: 'Unexpected error',
        lastVerifiedAt: new Date(),
      };

      if (
        !this.validateStateTransition(
          this.lastLocation?.status ?? 'loading',
          'error',
          unexpectedErrorState,
        )
      ) {
        console.warn('Invalid transition to unexpected error state');
      }

      this.lastLocation = unexpectedErrorState;
      return unexpectedErrorState;
    }
  }
}
