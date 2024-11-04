// hooks/useFaceDetection.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

export const useFaceDetection = (
  captureThreshold: number = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [faceDetectionCountState, setFaceDetectionCountState] = useState(0);

  useEffect(() => {
    const loadModel = async () => {
      await tf.ready();
      const loadedModel = await faceDetection.createDetector(
        faceDetection.SupportedModels.MediaPipeFaceDetector,
        { runtime: 'tfjs', modelType: 'short' },
      );
      setModel(loadedModel);
      setIsModelLoading(false);
    };
    loadModel();
  }, []);

  const capturePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setPhoto(imageSrc);
      onPhotoCapture(imageSrc);
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      return imageSrc;
    }
    return null;
  }, [onPhotoCapture]);

  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !model) return;

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

    if (detections.length > 0) {
      setFaceDetected(true);
      faceDetectionCount.current += 1;
      setFaceDetectionCountState(faceDetectionCount.current);
      setMessage('ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');

      if (faceDetectionCount.current >= captureThreshold) {
        capturePhoto();
        setMessage('บันทึกภาพสำเร็จ');
      }
    } else {
      setFaceDetected(false);
      faceDetectionCount.current = 0;
      setFaceDetectionCountState(0);
      setMessage('ไม่พบใบหน้าของพนักงาน..');
    }
  }, [model, captureThreshold, capturePhoto]);

  const startDetection = useCallback(() => {
    if (!isModelLoading && !photo) {
      detectionIntervalRef.current = setInterval(detectFace, 500);
    }
  }, [detectFace, isModelLoading, photo]);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
  }, []);

  useEffect(() => {
    startDetection();
    return () => stopDetection();
  }, [startDetection, stopDetection]);

  const resetDetection = useCallback(() => {
    setPhoto(null);
    setFaceDetected(false);
    faceDetectionCount.current = 0;
    stopDetection();
    startDetection();
  }, [stopDetection, startDetection]);

  return {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount: faceDetectionCountState,
    photo,
    setPhoto,
    message,
    resetDetection,
    captureThreshold,
  };
};
