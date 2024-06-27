// components/WebcamWrapper.tsx
import React, { forwardRef } from 'react';
import Webcam from 'react-webcam';

interface WebcamWrapperProps {
  audio?: boolean;
  screenshotFormat?: 'image/webp' | 'image/png' | 'image/jpeg' | undefined;
  className?: string;
}

const WebcamWrapper = forwardRef<Webcam, WebcamWrapperProps>((props, ref) => {
  return <Webcam {...props} ref={ref} />;
});

WebcamWrapper.displayName = 'WebcamWrapper';

export default WebcamWrapper;
