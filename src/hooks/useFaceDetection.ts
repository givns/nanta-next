// hooks/useFaceDetection.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

interface FaceDetectionState {
  isModelLoading: boolean;
  faceDetected: boolean;
  faceDetectionCount: number;
  photo: string | null;
  message: string;
}

export const useFaceDetection = (
  captureThreshold: number = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [state, setState] = useState<FaceDetectionState>({
    isModelLoading: true,
    faceDetected: false,
    faceDetectionCount: 0,
    photo: null,
    message: '',
  });
  const webcamRef = useRef<Webcam>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadModel = async () => {
      setState((prev) => ({ ...prev, isModelLoading: true }));

      await tf.ready();
      const loadedModel = await faceDetection.createDetector(
        faceDetection.SupportedModels.MediaPipeFaceDetector,
        { runtime: 'tfjs', modelType: 'short' },
      );

      if (!isCancelled) {
        setModel(loadedModel);
        setState((prev) => ({ ...prev, isModelLoading: false }));
      }
    };

    loadModel();

    return () => {
      isCancelled = true;
    };
  }, []);

  const capturePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setState((prev) => ({ ...prev, photo: imageSrc }));
      onPhotoCapture(imageSrc);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return imageSrc;
    }
    return null;
  }, [onPhotoCapture]);

  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !model || state.photo) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    const img = new Image();
    img.src = imageSrc;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const detections = await model.estimateFaces(img, {
      flipHorizontal: false,
    });

    setState((prev) => {
      const newCount = detections.length > 0 ? prev.faceDetectionCount + 1 : 0;
      const newMessage =
        detections.length > 0
          ? 'ระบบตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...'
          : 'ไม่พบใบหน้าของพนักงาน..';

      if (newCount >= captureThreshold) {
        capturePhoto();
        return {
          ...prev,
          faceDetected: true,
          faceDetectionCount: newCount,
          message: 'ระบบบันทึกรูปภาพแล้ว',
        };
      }

      return {
        ...prev,
        faceDetected: detections.length > 0,
        faceDetectionCount: newCount,
        message: newMessage,
      };
    });

    animationFrameRef.current = requestAnimationFrame(detectFace);
  }, [model, captureThreshold, capturePhoto, state.photo]);

  useEffect(() => {
    if (!state.isModelLoading && !state.photo) {
      animationFrameRef.current = requestAnimationFrame(detectFace);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [detectFace, state.isModelLoading, state.photo]);

  const resetDetection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      photo: null,
      faceDetected: false,
      faceDetectionCount: 0,
    }));
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(detectFace);
  }, [detectFace]);

  return {
    webcamRef,
    ...state,
    resetDetection,
    captureThreshold,
  };
};
