// src/utils/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Add a request interceptor
api.interceptors.request.use(
  (config) => {
    const lineUserId = localStorage.getItem('lineUserId');
    if (lineUserId) {
      config.headers['x-line-userid'] = lineUserId;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default api;
