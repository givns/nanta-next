// hooks/useFaceDetection.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

export const useFaceDetection = (captureThreshold: number = 5) => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);

  // Load the face detection model
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
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setPhoto(imageSrc);
      return imageSrc;
    }
    return null;
  }, []);

  const detectFace = useCallback(async () => {
    if (webcamRef.current && model) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
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
          setMessage('Face detected. Please stay still...');

          if (faceDetectionCount.current >= captureThreshold) {
            capturePhoto();
            setMessage('Photo captured successfully!');
          }
        } else {
          setFaceDetected(false);
          faceDetectionCount.current = 0;
          setMessage(
            'No face detected. Please position your face in the camera.',
          );
        }
      }
    }
  }, [model, captureThreshold, capturePhoto]);

  useEffect(() => {
    if (!isModelLoading && !photo) {
      const interval = setInterval(detectFace, 1000);
      return () => clearInterval(interval);
    }
  }, [detectFace, isModelLoading, photo]);

  const resetDetection = useCallback(() => {
    setPhoto(null);
    setFaceDetected(false);
    faceDetectionCount.current = 0;
  }, []);

  return {
    webcamRef,
    isModelLoading,
    faceDetected,
    photo,
    setPhoto,
    message,
    resetDetection,
  };
};
