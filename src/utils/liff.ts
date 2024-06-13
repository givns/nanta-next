import liff from '@line/liff';

export const initializeLiff = async (): Promise<void> => {
  await (liff as typeof liff).init({
    liffId: process.env.NEXT_PUBLIC_LIFF_ID as string,
  });
  if (!(await (liff as typeof liff).isLoggedIn())) {
    (liff as typeof liff).login();
  }
};
