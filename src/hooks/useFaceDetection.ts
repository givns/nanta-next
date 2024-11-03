import { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs-backend-webgl';
import Webcam from 'react-webcam';

export const useFaceDetection = (
  captureThreshold = 5,
  onPhotoCapture: (photo: string) => void,
) => {
  const [model, setModel] = useState<faceDetection.FaceDetector | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceDetected, setFaceDetected] = useState(false);
  const [message, setMessage] = useState<string>('กำลังเริ่มต้นระบบ...');
  const webcamRef = useRef<Webcam>(null);
  const faceDetectionCount = useRef(0);
  const [faceDetectionCountState, setFaceDetectionCountState] = useState(0);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const modelLoadingTimeout = useRef<NodeJS.Timeout | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  // Check camera permission before loading model
  useEffect(() => {
    const checkCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (stream) {
          setHasCameraPermission(true);
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch (error) {
        setMessage('ไม่สามารถเปิดกล้องได้');
      }
    };

    checkCameraPermission();
  }, []);

  // Initialize model after permission is granted
  useEffect(() => {
    if (!hasCameraPermission) return;

    const loadModel = async (useCpu = false) => {
      const MAX_RETRIES = 3;
      const TIMEOUT_MS = 20000;
      let retryCount = 0;
      let isMounted = true;

      const attemptModelLoad = async () => {
        try {
          if (detectionIntervalRef.current)
            clearInterval(detectionIntervalRef.current);
          if (modelLoadingTimeout.current)
            clearTimeout(modelLoadingTimeout.current);

          modelLoadingTimeout.current = setTimeout(() => {
            if (isMounted && isModelLoading) {
              throw new Error('Model loading timeout');
            }
          }, TIMEOUT_MS);

          // Load WebGL or CPU backend
          const backend = useCpu ? 'cpu' : 'webgl';
          await tf.setBackend(backend);
          await tf.ready();

          if (backend === 'webgl' && !tf.ENV.getBool('WEBGL_VERSION')) {
            throw new Error('WebGL not supported on this device');
          }

          const detector = await faceDetection.createDetector(
            faceDetection.SupportedModels.MediaPipeFaceDetector,
            {
              runtime: 'tfjs',
              modelType: 'short',
              maxFaces: 1,
            },
          );

          if (!detector) throw new Error('Failed to create detector');
          if (isMounted) {
            clearTimeout(modelLoadingTimeout.current!);
            setModel(detector);
            setIsModelLoading(false);
            setMessage('กรุณาวางใบหน้าให้อยู่ในกรอบ');
          }
        } catch (error) {
          if (!isMounted) return;

          if (retryCount < MAX_RETRIES) {
            retryCount++;
            setMessage(`กำลังลองใหม่... (${retryCount}/${MAX_RETRIES})`);
            setTimeout(attemptModelLoad, 1000);
          } else if (!useCpu) {
            setMessage('WebGL failed, retrying with CPU backend...');
            await loadModel(true); // Retry with CPU if WebGL fails
          } else {
            setIsModelLoading(false);
            setMessage('ไม่สามารถโหลดระบบตรวจจับใบหน้าได้');
          }
        }
      };

      attemptModelLoad();

      return () => {
        isMounted = false;
        if (detectionIntervalRef.current)
          clearInterval(detectionIntervalRef.current);
        if (modelLoadingTimeout.current)
          clearTimeout(modelLoadingTimeout.current);
      };
    };

    loadModel();
  }, [hasCameraPermission]);

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
        setTimeout(() => reject(new Error('Image load timeout')), 3000);
      });

      const detections = await model.estimateFaces(img, {
        flipHorizontal: false,
      });

      if (detections && detections.length > 0) {
        setFaceDetected(true);
        faceDetectionCount.current += 1;
        setFaceDetectionCountState(faceDetectionCount.current);
        setMessage('ตรวจพบใบหน้า กรุณาอย่าเคลื่อนไหว...');

        if (faceDetectionCount.current >= captureThreshold) {
          onPhotoCapture(imageSrc);
          setMessage('บันทึกภาพสำเร็จ');
          if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
          }
        }
      } else {
        setFaceDetected(false);
        faceDetectionCount.current = 0;
        setFaceDetectionCountState(0);
        setMessage('ไม่พบใบหน้า กรุณาวางใบหน้าให้อยู่ในกรอบ');
      }
    } catch (error) {
      faceDetectionCount.current = 0;
      setFaceDetectionCountState(0);
    }
  }, [model, captureThreshold, onPhotoCapture]);

  const startDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    if (model && !isModelLoading) {
      detectionIntervalRef.current = setInterval(detectFace, 500);
    }
  }, [detectFace, model, isModelLoading]);

  const resetDetection = useCallback(() => {
    faceDetectionCount.current = 0;
    setFaceDetectionCountState(0);
    setFaceDetected(false);
    startDetection();
  }, [startDetection]);

  useEffect(() => {
    if (model && !isModelLoading) {
      startDetection();
    }
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [model, isModelLoading, startDetection]);

  return {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount: faceDetectionCountState,
    message,
    resetDetection,
    captureThreshold,
  };
};
