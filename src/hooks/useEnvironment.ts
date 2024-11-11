//useEnvironment.ts
import { useState, useEffect } from 'react';

export function useEnvironment() {
  const [environment, setEnvironment] = useState({
    isDesktop: false,
    isLiffBrowser: true,
    isMounted: false,
  });

  useEffect(() => {
    const checkEnvironment = () => {
      const isLiff =
        window.location.href.includes('liff.line.me') ||
        /Line/i.test(window.navigator.userAgent) ||
        Boolean((window as any).liff?.isInClient?.());

      // Improved desktop detection
      const isMobileUserAgent =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          window.navigator.userAgent,
        );

      // Consider desktop if not a mobile device, regardless of window size
      const isDesktop = !isMobileUserAgent;

      setEnvironment({
        isDesktop,
        isLiffBrowser: isLiff,
        isMounted: true,
      });

      console.log('Environment Check:', {
        isDesktop,
        isLiff,
        isMobileDevice: isMobileUserAgent,
        width: window.innerWidth,
        url: window.location.href,
        userAgent: window.navigator.userAgent,
      });
    };

    checkEnvironment();
    window.addEventListener('resize', checkEnvironment);
    return () => window.removeEventListener('resize', checkEnvironment);
  }, []);

  return environment;
}
