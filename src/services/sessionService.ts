let inactivityTimeout: NodeJS.Timeout;

const startSessionTimeout = (logoutCallback: () => void) => {
  clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(logoutCallback, 30 * 60 * 1000); // 30 minutes
};

const resetSessionTimeout = (logoutCallback: () => void) => {
  clearTimeout(inactivityTimeout);
  startSessionTimeout(logoutCallback);
};

export const initializeSessionHandling = (logoutCallback: () => void) => {
  const resetTimeout = () => resetSessionTimeout(logoutCallback);

  window.addEventListener('mousemove', resetTimeout);
  window.addEventListener('keydown', resetTimeout);
  window.addEventListener('scroll', resetTimeout);
  window.addEventListener('touchstart', resetTimeout); // For mobile

  startSessionTimeout(logoutCallback);
};

export const clearSessionHandling = () => {
  clearTimeout(inactivityTimeout);
  const resetTimeout = () => {};
  window.removeEventListener('mousemove', resetTimeout);
  window.removeEventListener('keydown', resetTimeout);
  window.removeEventListener('scroll', resetTimeout);
  window.removeEventListener('touchstart', resetTimeout); // For mobile
};
