const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 3000,
) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error('Fetch failed');
      return response;
    } catch (error) {
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2;
      } else {
        throw error;
      }
    }
  }
};

export default fetchWithRetry;
