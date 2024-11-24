// services/FaceDetectionService.ts
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import '@tensorflow/tfjs-backend-webgl';

export class FaceDetectionService {
  private model: blazeface.BlazeFaceModel | null = null;
  private static instance: FaceDetectionService;
  private isInitialized = false;
  private modelLoadPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): FaceDetectionService {
    if (!FaceDetectionService.instance) {
      FaceDetectionService.instance = new FaceDetectionService();
    }
    return FaceDetectionService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.modelLoadPromise) return this.modelLoadPromise;

    this.modelLoadPromise = (async () => {
      try {
        // Initialize WebGL backend
        await tf.setBackend('webgl');
        await tf.ready();

        // Load model from self-hosted URL
        this.model = await blazeface.load({
          modelUrl: '/tf-model/model.json',
        });

        this.isInitialized = true;
      } catch (error) {
        console.error('Failed to initialize face detection:', error);
        throw error;
      } finally {
        this.modelLoadPromise = null;
      }
    })();

    return this.modelLoadPromise;
  }

  async detectFaces(
    imageElement: HTMLImageElement,
  ): Promise<blazeface.NormalizedFace[]> {
    if (!this.model) {
      throw new Error('Face detection model not initialized');
    }

    try {
      return await this.model.estimateFaces(imageElement, false);
    } catch (error) {
      console.error('Face detection error:', error);
      throw error;
    }
  }

  cleanup(): void {
    tf.engine().reset();
    this.isInitialized = false;
    this.model = null;
  }
}

// Type definitions
export interface FaceDetectionState {
  isModelLoading: boolean;
  faceDetected: boolean;
  faceDetectionCount: number;
  message: string;
}

export const FACE_DETECTION_MESSAGES = {
  INITIALIZING: 'กำลังเริ่มต้นระบบ...',
  READY: 'กรุณาวางใบหน้าให้อยู่ในกรอบ',
  FACE_DETECTED: 'ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...',
  NO_FACE: 'ไม่พบใบหน้า กรุณาวางใบหน้าให้อยู่ในกรอบ',
  SUCCESS: 'บันทึกภาพสำเร็จ',
  ERROR: 'เกิดข้อผิดพลาดในการตรวจจับใบหน้า',
  LOAD_ERROR: 'ไม่สามารถโหลดระบบตรวจจับใบหน้าได้',
} as const;
