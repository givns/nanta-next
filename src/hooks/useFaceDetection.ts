// hooks/useFaceDetection.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

export const useFaceDetection = () => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    const loadFaceDetectionModel = async () => {
      await tf.ready();
      const loadedModel = await faceDetection.createDetector(
        faceDetection.SupportedModels.MediaPipeFaceDetector,
        {
          runtime: 'tfjs',
          modelType: 'short',
        },
      );
      setModel(loadedModel);
      setIsModelLoading(false);
      console.log('Face detection model loaded.');
    };

    loadFaceDetectionModel();
  }, []);

  const capturePhoto = useCallback(async () => {
    if (webcamRef.current && model) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        try {
          const img = new window.Image();
          img.src = imageSrc;
          await new Promise((resolve) => {
            img.onload = resolve;
          });

          const detections = await model.estimateFaces(img);

          if (detections.length > 0) {
            return imageSrc;
          } else {
            throw new Error('No face detected');
          }
        } catch (error) {
          throw error;
        }
      } else {
        throw new Error('Camera not available');
      }
    }
    throw new Error('Webcam or model not initialized');
  }, [model]);

  return { webcamRef, model, isModelLoading, capturePhoto };
};
