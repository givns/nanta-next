import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

export const useFaceDetection = (
  captureThreshold: number = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [model, setModel] = useState<blazeface.BlazeFaceModel | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const [faceDetectionCount, setFaceDetectionCount] = useState(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load the model from the self-hosted URL on mount
  useEffect(() => {
    let mounted = true;

    const setupModel = async () => {
      setMessage('กำลังเริ่มต้นระบบ...');
      setIsModelLoading(true);

      try {
        // Ensure WebGL backend is ready
        await tf.setBackend('webgl');
        await tf.ready();

        // Self-hosted BlazeFace model URL
        const modelUrl = '/tf-model/model.json';

        // Initialize the BlazeFace detector with the local model URL
        const detector = await blazeface.load({
          modelUrl: modelUrl,
        });

        if (mounted) {
          setModel(detector);
          setIsModelLoading(false);
          setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
        }
      } catch (error) {
        console.error('Model loading error:', error);
        if (mounted) {
          setIsModelLoading(false);
          setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');
        }
      }
    };

    setupModel();

    // Cleanup function on unmount
    return () => {
      mounted = false;
      tf.engine().reset();
    };
  }, []);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // in useFaceDetection.ts
  const detectFace = useCallback(async () => {
    if (!webcamRef.current || !model) return;

    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;

      const img = new Image();
      img.src = imageSrc;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });

      const faces = await model.estimateFaces(img, false);

      if (faces.length > 0) {
        setFaceDetected(true);
        setFaceDetectionCount((prev) => {
          const newCount = prev + 1;
          console.log(
            'Face detection count:',
            newCount,
            'threshold:',
            captureThreshold,
          );

          if (newCount >= captureThreshold) {
            console.log('Threshold reached, capturing photo');
            // Stop detection immediately
            stopDetection();
            // Stop webcam
            if (webcamRef.current?.stream) {
              const tracks = webcamRef.current.stream.getTracks();
              tracks.forEach((track) => track.stop());
            }
            // Call capture callback
            onPhotoCapture(imageSrc);
            setMessage('บันทึกภาพสำเร็จ');
            return captureThreshold;
          }

          setMessage('ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');
          return newCount;
        });
      } else {
        setFaceDetected(false);
        setFaceDetectionCount(0);
        setMessage('ไม่พบใบหน้า กรุณาวางใบหน้าให้อยู่ในกรอบ');
      }
    } catch (error) {
      console.error('Error during face detection:', error);
      stopDetection();
      setMessage('เกิดข้อผิดพลาดในการตรวจจับใบหน้า');
    }
  }, [model, captureThreshold, onPhotoCapture, stopDetection]);

  const startDetection = useCallback(() => {
    stopDetection();
    detectionIntervalRef.current = setInterval(detectFace, 500);
  }, [detectFace]);

  // In your useFaceDetection hook
  useEffect(() => {
    if (faceDetected) {
      console.log('Face detected, status:', {
        faceDetected,
        faceDetectionCount,
      });
    }
  }, [faceDetected, faceDetectionCount]);

  const resetDetection = useCallback(() => {
    setFaceDetectionCount(0);
    setFaceDetected(false);
    stopDetection();
    startDetection();
  }, [startDetection, stopDetection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetection();
      if (webcamRef.current?.stream) {
        const tracks = webcamRef.current.stream.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [stopDetection]);

  // Start detection when model is ready
  useEffect(() => {
    if (model && !isModelLoading) {
      startDetection();
    }
  }, [model, isModelLoading, startDetection]);

  return {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount,
    message,
    resetDetection,
    captureThreshold,
  };
};
