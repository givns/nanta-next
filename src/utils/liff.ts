import liff from '@line/liff';

export type LiffContext = typeof liff;

declare global {
  interface Window {
    liff: LiffContext;
  }
}

export async function initializeLiff(): Promise<LiffContext> {
  if (!window.liff) {
    throw new Error('LIFF SDK is not loaded');
  }

  await window.liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID as string });
  return window.liff;
}

export function getLiff(): LiffContext {
  if (!window.liff) {
    throw new Error('LIFF is not initialized');
  }
  return window.liff;
}

export function isLiffLoggedIn(): boolean {
  return (
    window.liff &&
    (window.liff as any).isLoggedIn &&
    (window.liff as any).isLoggedIn()
  );
}

export function isLiffInClient(): boolean {
  return (
    window.liff &&
    (window.liff as any).isInClient &&
    (window.liff as any).isInClient()
  );
}
